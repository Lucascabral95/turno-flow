import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { type AvailabilityException, type AvailabilityRule, type Service } from "@prisma/client";

import { activeAppointmentStatuses } from "../appointments/status";
import { calculateAvailability, type AvailabilitySlot } from "../appointments/availability";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { toSlug } from "../common/slug";
import { minutesSinceMidnight, parseDateOnly, weekdayUtc } from "../common/time";
import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAvailabilityExceptionDto, UpdateAvailabilityExceptionDto } from "./dto/availability-exception.dto";
import type { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from "./dto/availability-rule.dto";
import type { CreateBusinessDto, UpdateBusinessDto } from "./dto/business.dto";
import type { UpdateReminderSettingsDto } from "./dto/reminder-settings.dto";
import type { CreateServiceDto, UpdateServiceDto } from "./dto/service.dto";
import type { CreateStaffMemberDto, UpdateStaffMemberDto } from "./dto/staff-member.dto";

@Injectable()
export class BusinessesService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService
  ) {}

  async getCurrent(user: AuthenticatedUser) {
    return this.prisma.business.findFirst({
      include: {
        availabilityExceptions: { orderBy: [{ date: "asc" }, { startTime: "asc" }] },
        availabilityRules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        services: { orderBy: { createdAt: "asc" } },
        staffMembers: { orderBy: { createdAt: "asc" } }
      },
      where: { ownerId: user.id }
    });
  }

  async createCurrent(user: AuthenticatedUser, input: CreateBusinessDto) {
    const existingBusiness = await this.getCurrent(user);

    if (existingBusiness) {
      throw new ConflictException("User already has a business");
    }

    const slug = await this.createAvailableSlug(input.slug ?? input.name);

    return this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          email: input.email,
          name: input.name,
          ownerId: user.id,
          reminderSettings: {
            create: {}
          },
          slug,
          timezone: input.timezone ?? "America/Argentina/Buenos_Aires"
        }
      });

      await this.outbox.create(tx, {
        aggregateId: business.id,
        businessId: business.id,
        payload: {
          businessId: business.id,
          email: business.email,
          name: business.name,
          slug: business.slug,
          timezone: business.timezone
        },
        routingKey: EventRoutingKeys.BusinessCreated,
        type: EventTypes.BusinessCreated,
        version: 1
      });

      return business;
    });
  }

  async updateCurrent(user: AuthenticatedUser, input: UpdateBusinessDto) {
    const business = await this.requireCurrentBusiness(user);

    return this.updateBusiness(user, business.id, input);
  }

  async updateBusiness(user: AuthenticatedUser, businessId: string, input: UpdateBusinessDto) {
    const business = await this.requireBusinessForUser(user, businessId);

    return this.prisma.business.update({
      data: input,
      where: { id: business.id }
    });
  }

  async getService(user: AuthenticatedUser, serviceId: string) {
    const business = await this.requireCurrentBusiness(user);
    const service = await this.prisma.service.findFirst({
      where: { businessId: business.id, id: serviceId }
    });

    if (!service) {
      throw new NotFoundException("Service not found");
    }

    return service;
  }

  async getReminderSettings(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.businessReminderSettings.upsert({
      create: { businessId: business.id },
      update: {},
      where: { businessId: business.id }
    });
  }

  async updateReminderSettings(user: AuthenticatedUser, input: UpdateReminderSettingsDto) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.businessReminderSettings.upsert({
      create: {
        businessId: business.id,
        ...input
      },
      update: input,
      where: { businessId: business.id }
    });
  }

  async listServices(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.service.findMany({
      orderBy: { createdAt: "asc" },
      where: { businessId: business.id }
    });
  }

  async createService(user: AuthenticatedUser, input: CreateServiceDto) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: { ...input, businessId: business.id }
      });

      await this.outbox.create(tx, {
        aggregateId: service.id,
        businessId: business.id,
        payload: this.servicePayload(service),
        routingKey: EventRoutingKeys.ServiceCreated,
        type: EventTypes.ServiceCreated,
        version: 1
      });

      return service;
    });
  }

  async updateService(user: AuthenticatedUser, serviceId: string, input: UpdateServiceDto) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireService(business.id, serviceId);

    return this.prisma.service.update({
      data: input,
      where: { id: serviceId }
    });
  }

  async deactivateService(user: AuthenticatedUser, serviceId: string) {
    return this.updateService(user, serviceId, { active: false });
  }

  async listStaffMembers(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.staffMember.findMany({
      orderBy: { createdAt: "asc" },
      where: { businessId: business.id }
    });
  }

  async createStaffMember(user: AuthenticatedUser, input: CreateStaffMemberDto) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.staffMember.create({
      data: { ...input, businessId: business.id }
    });
  }

  async updateStaffMember(user: AuthenticatedUser, staffMemberId: string, input: UpdateStaffMemberDto) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireStaffMember(business.id, staffMemberId);

    return this.prisma.staffMember.update({
      data: input,
      where: { id: staffMemberId }
    });
  }

  async deactivateStaffMember(user: AuthenticatedUser, staffMemberId: string) {
    return this.updateStaffMember(user, staffMemberId, { active: false });
  }

  async listAvailabilityRules(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.availabilityRule.findMany({
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      where: { businessId: business.id }
    });
  }

  async getAvailabilitySlots(user: AuthenticatedUser, serviceId: string, date: string): Promise<AvailabilitySlot[]> {
    const business = await this.requireCurrentBusiness(user);
    const service = await this.prisma.service.findFirst({
      where: {
        active: true,
        businessId: business.id,
        id: serviceId
      }
    });

    if (!service) {
      throw new NotFoundException("Service not found");
    }

    const requestedDate = parseDateOnly(date);
    const nextDate = new Date(requestedDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    const [activeStaffMembers, rules, exceptions, busySlots] = await Promise.all([
      this.prisma.staffMember.findMany({
        select: { id: true },
        where: { active: true, businessId: business.id }
      }),
      this.prisma.availabilityRule.findMany({
        select: {
          endTime: true,
          staffMemberId: true,
          startTime: true
        },
        where: {
          active: true,
          businessId: business.id,
          staffMember: { active: true },
          weekday: weekdayUtc(requestedDate)
        }
      }),
      this.prisma.availabilityException.findMany({
        select: {
          endTime: true,
          staffMemberId: true,
          startTime: true,
          type: true
        },
        where: {
          businessId: business.id,
          date: requestedDate,
          OR: [{ staffMemberId: null }, { staffMember: { active: true } }]
        }
      }),
      this.prisma.appointment.findMany({
        select: {
          endsAt: true,
          staffMemberId: true,
          startsAt: true
        },
        where: {
          businessId: business.id,
          endsAt: { gt: requestedDate },
          startsAt: { lt: nextDate },
          status: { in: activeAppointmentStatuses }
        }
      })
    ]);

    return calculateAvailability({
      activeStaffMemberIds: activeStaffMembers.map((staffMember) => staffMember.id),
      bufferMinutes: service.bufferMinutes,
      busySlots,
      date,
      durationMinutes: service.durationMinutes,
      exceptions,
      rules
    });
  }

  async createAvailabilityRule(user: AuthenticatedUser, input: CreateAvailabilityRuleDto) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireStaffMember(business.id, input.staffMemberId);
    this.assertTimeRange(input.startTime, input.endTime);
    await this.assertUniqueWeeklyAvailabilityRule(business.id, input.staffMemberId, input.weekday);

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.availabilityRule.create({
        data: { ...input, businessId: business.id }
      });

      await this.outbox.create(tx, {
        aggregateId: rule.id,
        businessId: business.id,
        payload: this.availabilityRulePayload(rule),
        routingKey: EventRoutingKeys.AvailabilityRuleCreated,
        type: EventTypes.AvailabilityRuleCreated,
        version: 1
      });

      return rule;
    });
  }

  async updateAvailabilityRule(user: AuthenticatedUser, ruleId: string, input: UpdateAvailabilityRuleDto) {
    const business = await this.requireCurrentBusiness(user);
    const rule = await this.prisma.availabilityRule.findFirst({
      where: { businessId: business.id, id: ruleId }
    });

    if (!rule) {
      throw new NotFoundException("Availability rule not found");
    }

    const nextStartTime = input.startTime ?? rule.startTime;
    const nextEndTime = input.endTime ?? rule.endTime;
    const nextWeekday = input.weekday ?? rule.weekday;
    const nextActive = input.active ?? rule.active;

    this.assertTimeRange(nextStartTime, nextEndTime);

    if (nextActive) {
      await this.assertUniqueWeeklyAvailabilityRule(business.id, rule.staffMemberId, nextWeekday, ruleId);
    }

    return this.prisma.availabilityRule.update({
      data: input,
      where: { id: ruleId }
    });
  }

  async deactivateAvailabilityRule(user: AuthenticatedUser, ruleId: string) {
    return this.updateAvailabilityRule(user, ruleId, { active: false });
  }

  async listAvailabilityExceptions(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.availabilityException.findMany({
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      where: { businessId: business.id }
    });
  }

  async createAvailabilityException(user: AuthenticatedUser, input: CreateAvailabilityExceptionDto) {
    const business = await this.requireCurrentBusiness(user);
    if (input.staffMemberId) {
      await this.requireStaffMember(business.id, input.staffMemberId);
    }
    this.assertTimeRange(input.startTime, input.endTime);

    return this.prisma.$transaction(async (tx) => {
      const exception = await tx.availabilityException.create({
        data: {
          businessId: business.id,
          date: parseDateOnly(input.date),
          endTime: input.endTime,
          reason: input.reason,
          staffMemberId: input.staffMemberId,
          startTime: input.startTime,
          type: input.type
        }
      });

      await this.outbox.create(tx, {
        aggregateId: exception.id,
        businessId: business.id,
        payload: this.availabilityExceptionPayload(exception),
        routingKey: EventRoutingKeys.AvailabilityExceptionCreated,
        type: EventTypes.AvailabilityExceptionCreated,
        version: 1
      });

      return exception;
    });
  }

  async updateAvailabilityException(
    user: AuthenticatedUser,
    exceptionId: string,
    input: UpdateAvailabilityExceptionDto
  ) {
    const business = await this.requireCurrentBusiness(user);
    const exception = await this.requireAvailabilityException(business.id, exceptionId);

    if (input.staffMemberId) {
      await this.requireStaffMember(business.id, input.staffMemberId);
    }

    this.assertTimeRange(input.startTime ?? exception.startTime, input.endTime ?? exception.endTime);

    return this.prisma.availabilityException.update({
      data: {
        date: input.date ? parseDateOnly(input.date) : undefined,
        endTime: input.endTime,
        reason: input.reason,
        staffMemberId: input.staffMemberId,
        startTime: input.startTime,
        type: input.type
      },
      where: { id: exceptionId }
    });
  }

  async deleteAvailabilityException(user: AuthenticatedUser, exceptionId: string) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireAvailabilityException(business.id, exceptionId);

    return this.prisma.availabilityException.delete({
      where: { id: exceptionId }
    });
  }

  async requireCurrentBusiness(user: AuthenticatedUser) {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: user.id }
    });

    if (!business) {
      throw new NotFoundException("Current business is not configured");
    }

    return business;
  }

  private async requireBusinessForUser(user: AuthenticatedUser, businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, ownerId: user.id }
    });

    if (!business) {
      throw new NotFoundException("Business not found");
    }

    return business;
  }

  private async requireService(businessId: string, serviceId: string): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { businessId, id: serviceId }
    });

    if (!service) {
      throw new NotFoundException("Service not found");
    }
  }

  private async requireStaffMember(businessId: string, staffMemberId: string): Promise<void> {
    const staffMember = await this.prisma.staffMember.findFirst({
      where: { businessId, id: staffMemberId }
    });

    if (!staffMember) {
      throw new NotFoundException("Staff member not found");
    }
  }

  private async requireAvailabilityException(
    businessId: string,
    exceptionId: string
  ): Promise<AvailabilityException> {
    const exception = await this.prisma.availabilityException.findFirst({
      where: { businessId, id: exceptionId }
    });

    if (!exception) {
      throw new NotFoundException("Availability exception not found");
    }

    return exception;
  }

  private async createAvailableSlug(value: string): Promise<string> {
    const baseSlug = toSlug(value);

    if (!baseSlug) {
      throw new ConflictException("Business slug cannot be empty");
    }

    for (let suffix = 0; suffix < 100; suffix += 1) {
      const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
      const existingBusiness = await this.prisma.business.findUnique({
        where: { slug: candidate }
      });

      if (!existingBusiness) {
        return candidate;
      }
    }

    throw new ConflictException("Could not generate an available business slug");
  }

  private assertTimeRange(startTime: string, endTime: string): void {
    if (minutesSinceMidnight(startTime) >= minutesSinceMidnight(endTime)) {
      throw new ConflictException("Availability start time must be before end time");
    }
  }

  private async assertUniqueWeeklyAvailabilityRule(
    businessId: string,
    staffMemberId: string,
    weekday: number,
    excludeRuleId?: string
  ): Promise<void> {
    const existingRule = await this.prisma.availabilityRule.findFirst({
      where: {
        active: true,
        businessId,
        id: excludeRuleId ? { not: excludeRuleId } : undefined,
        staffMemberId,
        weekday
      }
    });

    if (existingRule) {
      throw new ConflictException("Each professional can only have one active weekly availability per day");
    }
  }

  private servicePayload(service: Service) {
    return {
      active: service.active,
      bufferMinutes: service.bufferMinutes,
      businessId: service.businessId,
      durationMinutes: service.durationMinutes,
      name: service.name,
      priceCents: service.priceCents,
      serviceId: service.id
    };
  }

  private availabilityRulePayload(rule: AvailabilityRule) {
    return {
      businessId: rule.businessId,
      endTime: rule.endTime,
      ruleId: rule.id,
      staffMemberId: rule.staffMemberId,
      startTime: rule.startTime,
      weekday: rule.weekday
    };
  }

  private availabilityExceptionPayload(exception: AvailabilityException) {
    return {
      businessId: exception.businessId,
      date: exception.date.toISOString().slice(0, 10),
      endTime: exception.endTime,
      exceptionId: exception.id,
      reason: exception.reason,
      staffMemberId: exception.staffMemberId,
      startTime: exception.startTime,
      type: exception.type
    };
  }
}
