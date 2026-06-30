import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BusinessMemberRole, BusinessMemberStatus, DepositMode, type AvailabilityException, type AvailabilityRule, type Prisma, type Service } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { activeAppointmentStatuses } from "../appointments/status";
import { calculateAvailability, type AvailabilitySlot } from "../appointments/availability";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { toSlug } from "../common/slug";
import { minutesSinceMidnight, parseDateOnly, weekdayUtc, zonedDayBounds } from "../common/time";
import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAvailabilityExceptionDto, UpdateAvailabilityExceptionDto } from "./dto/availability-exception.dto";
import type { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from "./dto/availability-rule.dto";
import type { CreateBusinessDto, UpdateBusinessDto } from "./dto/business.dto";
import type { CreateNotificationTemplateDto, UpdateNotificationTemplateDto } from "./dto/notification-template.dto";
import type { UpdatePaymentSettingsDto } from "./dto/payment-settings.dto";
import { BusinessOnboardingService } from "./onboarding.service";
import type { UpdateReminderSettingsDto } from "./dto/reminder-settings.dto";
import type { CreateServiceDto, UpdateServiceDto } from "./dto/service.dto";
import type { CreateStaffMemberDto, UpdateStaffMemberDto } from "./dto/staff-member.dto";
import type { ChangeMemberRoleDto, InviteMemberDto } from "./dto/member.dto";

@Injectable()
export class BusinessesService {
  constructor(
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService,
    private readonly onboarding: BusinessOnboardingService
  ) {}

  async getCurrent(user: AuthenticatedUser) {
    const business = await this.prisma.business.findFirst({
      include: {
        availabilityExceptions: { orderBy: [{ date: "asc" }, { startTime: "asc" }] },
        availabilityRules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        services: { orderBy: { createdAt: "asc" } },
        staffMembers: { orderBy: { createdAt: "asc" } }
      },
      where: {
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                active: true,
                userId: user.id
              }
            }
          }
        ]
      }
    });

    if (!business) {
      return null;
    }

    return {
      ...business,
      onboarding: await this.onboarding.getStatusForBusinessSnapshot({
        ...business,
        availabilityRules: business.availabilityRules.filter((rule) => rule.active),
        services: business.services.filter((service) => service.active),
        staffMembers: business.staffMembers.filter((staffMember) => staffMember.active)
      })
    };
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

      await tx.businessMember.create({
        data: {
          businessId: business.id,
          role: BusinessMemberRole.OWNER,
          userId: user.id
        }
      });

      await this.audit.create(tx, {
        action: "business.created",
        after: {
          email: business.email,
          name: business.name,
          slug: business.slug,
          timezone: business.timezone
        },
        businessId: business.id,
        entity: "business",
        entityId: business.id,
        user
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.business.update({
        data: input,
        where: { id: business.id }
      });

      await this.audit.create(tx, {
        action: "business.updated",
        after: updated,
        before: business,
        businessId: business.id,
        entity: "business",
        entityId: business.id,
        user
      });

      return updated;
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

  async getPaymentSettings(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.paymentSettingsPayload(business);
  }

  async updatePaymentSettings(user: AuthenticatedUser, input: UpdatePaymentSettingsDto) {
    const business = await this.requireCurrentBusiness(user);
    const data = this.normalizePaymentSettingsInput(input);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.business.update({
        data,
        where: { id: business.id }
      });

      await this.audit.create(tx, {
        action: "payment_settings.updated",
        after: this.paymentSettingsPayload(updated),
        before: this.paymentSettingsPayload(business),
        businessId: business.id,
        entity: "payment_settings",
        entityId: business.id,
        user
      });

      return this.paymentSettingsPayload(updated);
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

  async listBusinessMembers(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.businessMember.findMany({
      select: {
        id: true,
        businessId: true,
        userId: true,
        role: true,
        status: true,
        inviteEmail: true,
        inviteExpiresAt: true,
        active: true,
        staffMemberId: true,
        createdAt: true,
        updatedAt: true,
        staffMember: { select: { email: true, id: true, name: true } },
        user: { select: { email: true, id: true, name: true } }
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      where: { businessId: business.id }
    });
  }

  async inviteMember(user: AuthenticatedUser, input: InviteMemberDto) {
    const business = await this.requireCurrentBusiness(user);
    const emailLower = input.email.toLowerCase();

    if (input.staffMemberId) {
      const sm = await this.prisma.staffMember.findFirst({
        where: { active: true, businessId: business.id, id: input.staffMemberId }
      });
      if (!sm) throw new NotFoundException("Staff member not found");

      const alreadyLinked = await this.prisma.businessMember.findFirst({
        where: { businessId: business.id, staffMemberId: input.staffMemberId, NOT: { userId: null } }
      });
      if (alreadyLinked) throw new ConflictException("Staff member is already linked to a team member");
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: emailLower } });

    if (existingUser) {
      const existingMember = await this.prisma.businessMember.findUnique({
        where: { businessId_userId: { businessId: business.id, userId: existingUser.id } }
      });

      if (existingMember?.active) {
        throw new ConflictException("User is already an active member of this business");
      }

      return this.prisma.$transaction(async (tx) => {
        const member = existingMember
          ? await tx.businessMember.update({
              data: {
                active: true,
                role: input.role,
                staffMemberId: input.staffMemberId ?? null,
                status: BusinessMemberStatus.ACTIVE
              },
              where: { id: existingMember.id }
            })
          : await tx.businessMember.create({
              data: {
                active: true,
                businessId: business.id,
                role: input.role,
                staffMemberId: input.staffMemberId ?? null,
                status: BusinessMemberStatus.ACTIVE,
                userId: existingUser.id
              }
            });

        await this.audit.create(tx, {
          action: "member.added",
          after: { email: emailLower, memberId: member.id, role: input.role },
          businessId: business.id,
          entity: "business_member",
          entityId: member.id,
          user
        });

        await this.outbox.create(tx, {
          aggregateId: member.id,
          businessId: business.id,
          payload: {
            businessId: business.id,
            directAdd: true,
            email: emailLower,
            memberId: member.id,
            role: input.role,
            userId: existingUser.id
          },
          routingKey: EventRoutingKeys.MemberInvited,
          type: EventTypes.MemberInvited,
          version: 1
        });

        return member;
      });
    }

    const pendingInvite = await this.prisma.businessMember.findFirst({
      where: { businessId: business.id, inviteEmail: emailLower, userId: null }
    });
    if (pendingInvite) {
      throw new ConflictException("A pending invite already exists for this email");
    }

    const rawToken = randomBytes(32).toString("base64url");
    const inviteTokenHash = createHash("sha256").update(rawToken).digest("hex");
    const inviteExpiresAt = new Date();
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 7);

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.businessMember.create({
        data: {
          active: false,
          businessId: business.id,
          inviteEmail: emailLower,
          inviteExpiresAt,
          inviteTokenHash,
          role: input.role,
          staffMemberId: input.staffMemberId ?? null,
          status: BusinessMemberStatus.PENDING_INVITE
        },
        select: {
          active: true,
          businessId: true,
          createdAt: true,
          id: true,
          inviteEmail: true,
          inviteExpiresAt: true,
          role: true,
          staffMemberId: true,
          status: true,
          updatedAt: true,
          userId: true
        }
      });

      await this.audit.create(tx, {
        action: "member.invited",
        after: { email: emailLower, memberId: member.id, role: input.role },
        businessId: business.id,
        entity: "business_member",
        entityId: member.id,
        user
      });

      await this.outbox.create(tx, {
        aggregateId: member.id,
        businessId: business.id,
        payload: {
          businessId: business.id,
          directAdd: false,
          email: emailLower,
          isPendingInvite: true,
          memberId: member.id,
          role: input.role
        },
        routingKey: EventRoutingKeys.MemberInvited,
        type: EventTypes.MemberInvited,
        version: 1
      });

      // inviteToken only returned once — caller uses it to generate the invite link
      return { ...member, inviteToken: rawToken };
    });
  }

  async changeMemberRole(user: AuthenticatedUser, memberId: string, input: ChangeMemberRoleDto) {
    const business = await this.requireCurrentBusiness(user);

    const member = await this.prisma.businessMember.findFirst({
      where: { businessId: business.id, id: memberId }
    });
    if (!member) throw new NotFoundException("Member not found");
    if (member.role === BusinessMemberRole.OWNER) {
      throw new ConflictException("Cannot change the role of the business owner");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.businessMember.update({
        data: { role: input.role },
        where: { id: memberId }
      });

      await this.audit.create(tx, {
        action: "member.role_changed",
        after: { role: input.role },
        before: { role: member.role },
        businessId: business.id,
        entity: "business_member",
        entityId: memberId,
        user
      });

      await this.outbox.create(tx, {
        aggregateId: memberId,
        businessId: business.id,
        payload: { businessId: business.id, memberId, newRole: input.role, previousRole: member.role },
        routingKey: EventRoutingKeys.MemberRoleChanged,
        type: EventTypes.MemberRoleChanged,
        version: 1
      });

      return updated;
    });
  }

  async deactivateMember(user: AuthenticatedUser, memberId: string) {
    const business = await this.requireCurrentBusiness(user);

    const member = await this.prisma.businessMember.findFirst({
      where: { businessId: business.id, id: memberId }
    });
    if (!member) throw new NotFoundException("Member not found");
    if (member.role === BusinessMemberRole.OWNER) {
      throw new ConflictException("Cannot deactivate the business owner");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.businessMember.update({
        data: { active: false, status: BusinessMemberStatus.INACTIVE },
        where: { id: memberId }
      });

      await this.audit.create(tx, {
        action: "member.deactivated",
        before: { active: member.active, role: member.role },
        businessId: business.id,
        entity: "business_member",
        entityId: memberId,
        user
      });

      return updated;
    });
  }

  async listServiceStaff(user: AuthenticatedUser, serviceId: string) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireService(business.id, serviceId);

    return this.prisma.serviceStaffMember.findMany({
      include: { staffMember: { select: { active: true, email: true, id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      where: { serviceId }
    });
  }

  async assignStaffToService(user: AuthenticatedUser, serviceId: string, staffMemberId: string) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireService(business.id, serviceId);
    await this.requireStaffMember(business.id, staffMemberId);

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.serviceStaffMember.upsert({
        create: { serviceId, staffMemberId },
        update: {},
        where: { serviceId_staffMemberId: { serviceId, staffMemberId } }
      });

      await this.audit.create(tx, {
        action: "service.staff_assigned",
        after: { serviceId, staffMemberId },
        businessId: business.id,
        entity: "service_staff_member",
        entityId: assignment.id,
        user
      });

      return assignment;
    });
  }

  async unassignStaffFromService(user: AuthenticatedUser, serviceId: string, staffMemberId: string) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireService(business.id, serviceId);

    const assignment = await this.prisma.serviceStaffMember.findUnique({
      where: { serviceId_staffMemberId: { serviceId, staffMemberId } }
    });
    if (!assignment) throw new NotFoundException("Staff assignment not found");

    return this.prisma.$transaction(async (tx) => {
      await tx.serviceStaffMember.delete({
        where: { serviceId_staffMemberId: { serviceId, staffMemberId } }
      });

      await this.audit.create(tx, {
        action: "service.staff_unassigned",
        before: { serviceId, staffMemberId },
        businessId: business.id,
        entity: "service_staff_member",
        entityId: assignment.id,
        user
      });

      return { deleted: true };
    });
  }

  async listNotificationTemplates(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);
    await this.ensureDefaultNotificationTemplates(business.id);

    return this.prisma.notificationTemplate.findMany({
      orderBy: [{ active: "desc" }, { key: "asc" }],
      where: { businessId: business.id }
    });
  }

  async createNotificationTemplate(user: AuthenticatedUser, input: CreateNotificationTemplateDto) {
    const business = await this.requireCurrentBusiness(user);
    const key = this.normalizeTemplateKey(input.key);

    if (!key) {
      throw new ConflictException("Notification template key cannot be empty");
    }

    const existingTemplate = await this.prisma.notificationTemplate.findUnique({
      where: {
        businessId_key: {
          businessId: business.id,
          key
        }
      }
    });

    if (existingTemplate) {
      throw new ConflictException("Notification template key already exists");
    }

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.notificationTemplate.create({
        data: {
          active: input.active ?? true,
          body: input.body,
          businessId: business.id,
          key,
          name: input.name,
          subject: input.subject
        }
      });

      await this.audit.create(tx, {
        action: "notification_template.created",
        after: template,
        businessId: business.id,
        entity: "notification_template",
        entityId: template.id,
        user
      });

      return template;
    });
  }

  async updateNotificationTemplate(user: AuthenticatedUser, templateId: string, input: UpdateNotificationTemplateDto) {
    const business = await this.requireCurrentBusiness(user);
    const before = await this.prisma.notificationTemplate.findFirst({
      where: { businessId: business.id, id: templateId }
    });

    if (!before) {
      throw new NotFoundException("Notification template not found");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationTemplate.update({
        data: input,
        where: { id: templateId }
      });

      await this.audit.create(tx, {
        action: "notification_template.updated",
        after: updated,
        before,
        businessId: business.id,
        entity: "notification_template",
        entityId: updated.id,
        user
      });

      return updated;
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
        data: { ...this.normalizeCreateServiceInput(input), businessId: business.id }
      });

      await this.audit.create(tx, {
        action: "service.created",
        after: this.servicePayload(service),
        businessId: business.id,
        entity: "service",
        entityId: service.id,
        user
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

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.service.findUniqueOrThrow({ where: { id: serviceId } });
      const updated = await tx.service.update({
        data: this.normalizeUpdateServiceInput(input),
        where: { id: serviceId }
      });

      await this.audit.create(tx, {
        action: "service.updated",
        after: this.servicePayload(updated),
        before: this.servicePayload(before),
        businessId: business.id,
        entity: "service",
        entityId: serviceId,
        user
      });

      return updated;
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

    return this.prisma.$transaction(async (tx) => {
      const staffMember = await tx.staffMember.create({
        data: { ...input, businessId: business.id }
      });

      await this.audit.create(tx, {
        action: "staff.created",
        after: staffMember,
        businessId: business.id,
        entity: "staff_member",
        entityId: staffMember.id,
        user
      });

      await this.outbox.create(tx, {
        aggregateId: staffMember.id,
        businessId: business.id,
        payload: {
          active: staffMember.active,
          businessId: business.id,
          email: staffMember.email,
          name: staffMember.name,
          staffMemberId: staffMember.id
        },
        routingKey: EventRoutingKeys.StaffMemberCreated,
        type: EventTypes.StaffMemberCreated,
        version: 1
      });

      return staffMember;
    });
  }

  async updateStaffMember(user: AuthenticatedUser, staffMemberId: string, input: UpdateStaffMemberDto) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireStaffMember(business.id, staffMemberId);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.staffMember.findUniqueOrThrow({ where: { id: staffMemberId } });
      const updated = await tx.staffMember.update({
        data: input,
        where: { id: staffMemberId }
      });

      const isDeactivation = input.active === false && before.active;
      const eventType = isDeactivation ? EventTypes.StaffMemberDeactivated : EventTypes.StaffMemberUpdated;
      const routingKey = isDeactivation ? EventRoutingKeys.StaffMemberDeactivated : EventRoutingKeys.StaffMemberUpdated;

      await this.audit.create(tx, {
        action: isDeactivation ? "staff.deactivated" : "staff.updated",
        after: updated,
        before,
        businessId: business.id,
        entity: "staff_member",
        entityId: staffMemberId,
        user
      });

      await this.outbox.create(tx, {
        aggregateId: updated.id,
        businessId: business.id,
        payload: {
          active: updated.active,
          businessId: business.id,
          email: updated.email,
          name: updated.name,
          staffMemberId: updated.id
        },
        routingKey,
        type: eventType,
        version: 1
      });

      return updated;
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
    const dayBounds = zonedDayBounds(date, business.timezone);

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
          endsAt: { gt: dayBounds.start },
          startsAt: { lt: dayBounds.end },
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
      rules,
      timezone: business.timezone
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

      await this.audit.create(tx, {
        action: "availability_rule.created",
        after: this.availabilityRulePayload(rule),
        businessId: business.id,
        entity: "availability_rule",
        entityId: rule.id,
        user
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

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.availabilityException.delete({
        where: { id: exceptionId }
      });

      await this.audit.create(tx, {
        action: "availability_exception.deleted",
        before: this.availabilityExceptionPayload(deleted),
        businessId: business.id,
        entity: "availability_exception",
        entityId: exceptionId,
        user
      });

      return deleted;
    });
  }

  async requireCurrentBusiness(user: AuthenticatedUser) {
    // Fast path: BusinessContextGuard already resolved businessId
    if (user.businessId) {
      const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
      if (business) return business;
    }

    // Fallback: resolve by user association (used when guard is not applied, e.g. createCurrent)
    const business = await this.prisma.business.findFirst({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { active: true, userId: user.id } } }
        ]
      }
    });

    if (!business) {
      throw new NotFoundException("Current business is not configured");
    }

    return business;
  }

  private async requireBusinessForUser(user: AuthenticatedUser, businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                active: true,
                userId: user.id
              }
            }
          }
        ]
      }
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

  private async ensureDefaultNotificationTemplates(businessId: string): Promise<void> {
    const defaults = [
      {
        body:
          "Hola {{customerName}}, te recordamos tu turno de {{serviceName}} el {{startsAt}}. Si no podes asistir, usa este link: {{cancelUrl}}",
        key: "appointment_reminder_24h",
        name: "Recordatorio 24 horas",
        subject: "Recordatorio de turno"
      },
      {
        body:
          "Hola {{customerName}}, se libero un turno para {{serviceName}} el {{startsAt}}. Aceptalo antes de {{expiresAt}} desde {{offerUrl}}.",
        key: "waitlist_offer",
        name: "Oferta de lista de espera",
        subject: "Se libero un turno"
      },
      {
        body:
          "Hola {{customerName}}, tu turno de {{serviceName}} fue reprogramado para {{startsAt}}. Si no podes asistir, usa este link: {{cancelUrl}}",
        key: "appointment_rescheduled",
        name: "Turno reprogramado",
        subject: "Tu turno fue reprogramado"
      }
    ];

    await Promise.all(
      defaults.map((template) =>
        this.prisma.notificationTemplate.upsert({
          create: {
            ...template,
            businessId
          },
          update: {},
          where: {
            businessId_key: {
              businessId,
              key: template.key
            }
          }
        })
      )
    );
  }

  private normalizeTemplateKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
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
      depositAmountCents: service.depositAmountCents,
      depositDescription: service.depositDescription,
      depositEnabled: service.depositEnabled,
      depositMode: service.depositMode.toLowerCase(),
      depositPercentage: service.depositPercentage,
      durationMinutes: service.durationMinutes,
      name: service.name,
      priceCents: service.priceCents,
      serviceId: service.id
    };
  }

  private normalizeCreateServiceInput(input: CreateServiceDto): Omit<Prisma.ServiceUncheckedCreateInput, "businessId"> {
    return {
      ...input,
      depositMode: input.depositMode ? this.toDepositMode(input.depositMode) : undefined
    };
  }

  private normalizeUpdateServiceInput(input: UpdateServiceDto): Prisma.ServiceUncheckedUpdateInput {
    return {
      ...input,
      depositMode: input.depositMode ? this.toDepositMode(input.depositMode) : undefined
    };
  }

  private toDepositMode(value: "fixed" | "percentage"): DepositMode {
    return value === "percentage" ? DepositMode.PERCENTAGE : DepositMode.FIXED;
  }

  private normalizePaymentSettingsInput(input: UpdatePaymentSettingsDto): Prisma.BusinessUpdateInput {
    return {
      manualDepositsEnabled: input.manualDepositsEnabled,
      paymentAccountHolder: this.optionalTrim(input.paymentAccountHolder),
      paymentAccountLabel: this.optionalTrim(input.paymentAccountLabel),
      paymentAlias: this.optionalTrim(input.paymentAlias),
      paymentInstructions: this.optionalTrim(input.paymentInstructions)
    };
  }

  private paymentSettingsPayload(business: {
    id: string;
    manualDepositsEnabled: boolean;
    paymentAccountHolder: string | null;
    paymentAccountLabel: string | null;
    paymentAlias: string | null;
    paymentInstructions: string | null;
  }) {
    return {
      businessId: business.id,
      manualDepositsEnabled: business.manualDepositsEnabled,
      paymentAccountHolder: business.paymentAccountHolder,
      paymentAccountLabel: business.paymentAccountLabel,
      paymentAlias: business.paymentAlias,
      paymentInstructions: business.paymentInstructions
    };
  }

  private optionalTrim(value: string | undefined): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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
