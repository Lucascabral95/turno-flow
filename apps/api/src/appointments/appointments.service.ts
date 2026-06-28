import { ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, Prisma, WaitlistOfferStatus, WaitlistStatus } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { createPublicToken } from "../common/tokens";
import { dateOnlyInTimeZone, parseDateOnly, weekdayUtc, zonedDayBounds } from "../common/time";
import { BusinessesService } from "../businesses/businesses.service";
import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { activeAppointmentStatuses, fromPrismaAppointmentStatus, toPrismaAppointmentStatus } from "./status";
import { calculateAvailability } from "./availability";
import type { AvailabilitySlot } from "./availability";
import type { PublicAppointmentStatus } from "./status";
import type {
  CancelAppointmentDto,
  CreatePublicAppointmentDto,
  CreateWaitlistEntryDto,
  RescheduleAppointmentDto,
  UpdateAppointmentStatusDto
} from "./dto/appointment.dto";

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: {
    customer: true;
    service: true;
    staffMember: true;
  };
}>;

const DEFAULT_BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

type WaitlistEntryWithRelations = Prisma.WaitlistEntryGetPayload<{
  include: {
    customer: true;
    offers: true;
    service: true;
  };
}>;

type WaitlistOfferForRejection = Prisma.WaitlistOfferGetPayload<{
  include: {
    appointment: {
      include: {
        customer: true;
        service: true;
        staffMember: true;
      };
    };
  };
}>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly audit: AuditService,
    private readonly businesses: BusinessesService,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService
  ) {}

  async getPublicBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({
      select: {
        email: true,
        id: true,
        name: true,
        slug: true,
        timezone: true
      },
      where: { slug }
    });

    if (!business) {
      throw new NotFoundException("Business not found");
    }

    return business;
  }

  async listPublicServices(slug: string) {
    const business = await this.getPublicBusiness(slug);

    return this.prisma.service.findMany({
      orderBy: { createdAt: "asc" },
      where: { active: true, businessId: business.id }
    });
  }

  async getAvailability(slug: string, serviceId: string, date: string): Promise<AvailabilitySlot[]> {
    const business = await this.getPublicBusiness(slug);
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
          startsAt: { lt: dayBounds.end },
          status: { in: activeAppointmentStatuses },
          endsAt: { gt: dayBounds.start }
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

  async createPublicAppointment(slug: string, input: CreatePublicAppointmentDto) {
    const business = await this.getPublicBusiness(slug);
    const startsAt = new Date(input.startsAt);

    if (Number.isNaN(startsAt.getTime())) {
      throw new ConflictException("Invalid appointment start date");
    }

    return this.createAppointmentInTransaction({
      businessId: business.id,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      serviceId: input.serviceId,
      staffMemberId: input.staffMemberId,
      startsAt
    });
  }

  async cancelPublicAppointment(appointmentId: string, input: CancelAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      include: { customer: true, service: true, staffMember: true },
      where: { id: appointmentId }
    });

    if (!appointment || appointment.cancellationToken !== input.token) {
      throw new NotFoundException("Appointment not found");
    }

    if (!activeAppointmentStatuses.includes(appointment.status)) {
      throw new ConflictException("Appointment is not active");
    }

    const cancelledAppointment = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.findUniqueOrThrow({
        select: { timezone: true },
        where: { id: appointment.businessId }
      });

      const updatedAppointment = await tx.appointment.update({
        data: { status: AppointmentStatus.CANCELLED_BY_CUSTOMER },
        include: { customer: true, service: true, staffMember: true },
        where: { id: appointment.id }
      });

      await tx.appointmentEvent.create({
        data: {
          appointmentId: appointment.id,
          businessId: appointment.businessId,
          eventType: EventTypes.AppointmentCancelled,
          metadata: {
            cancelledBy: "customer",
            status: "cancelled_by_customer"
          }
        }
      });

      await this.outbox.create(tx, {
        aggregateId: appointment.id,
        businessId: appointment.businessId,
        payload: this.appointmentPayload(updatedAppointment, business.timezone),
        routingKey: EventRoutingKeys.AppointmentCancelled,
        type: EventTypes.AppointmentCancelled,
        version: 1
      });

      await this.outbox.create(tx, {
        aggregateId: appointment.id,
        businessId: appointment.businessId,
        payload: this.appointmentPayload(updatedAppointment, business.timezone),
        routingKey: EventRoutingKeys.SlotReleased,
        type: EventTypes.SlotReleased,
        version: 1
      });

      return updatedAppointment;
    });

    return this.serializeAppointment(cancelledAppointment);
  }

  async reschedulePublicAppointment(appointmentId: string, input: RescheduleAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!appointment || appointment.cancellationToken !== input.token) {
      throw new NotFoundException("Appointment not found");
    }

    return this.rescheduleAppointment({
      appointmentId,
      requestedBy: null,
      source: "public",
      staffMemberId: input.staffMemberId,
      startsAt: input.startsAt
    });
  }

  async getPublicAppointment(appointmentId: string, input: CancelAppointmentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            timezone: true
          }
        },
        customer: true,
        service: true,
        staffMember: true
      },
      where: { id: appointmentId }
    });

    if (!appointment || appointment.cancellationToken !== input.token) {
      throw new NotFoundException("Appointment not found");
    }

    return {
      ...this.serializeAppointment(appointment),
      business: appointment.business
    };
  }

  async getPublicRescheduleSlots(appointmentId: string, input: CancelAppointmentDto, date: string): Promise<AvailabilitySlot[]> {
    const appointment = await this.prisma.appointment.findUnique({
      select: {
        businessId: true,
        cancellationToken: true,
        endsAt: true,
        id: true,
        serviceId: true,
        startsAt: true,
        status: true
      },
      where: { id: appointmentId }
    });

    if (!appointment || appointment.cancellationToken !== input.token) {
      throw new NotFoundException("Appointment not found");
    }

    return this.getRescheduleSlotsForAppointment(appointment, date);
  }

  async createWaitlistEntry(slug: string, input: CreateWaitlistEntryDto) {
    const business = await this.getPublicBusiness(slug);
    return this.createWaitlistEntryForBusiness(business.id, input);
  }

  async acceptWaitlistOffer(token: string) {
    const offer = await this.prisma.waitlistOffer.findUnique({
      include: {
        appointment: true,
        waitlistEntry: {
          include: {
            customer: true
          }
        }
      },
      where: { token }
    });

    if (!offer || offer.status !== WaitlistOfferStatus.PENDING || offer.expiresAt <= new Date()) {
      throw new NotFoundException("Waitlist offer not found");
    }

    return this.createAppointmentInTransaction({
      businessId: offer.appointment.businessId,
      customerEmail: offer.waitlistEntry.customer.email,
      customerName: offer.waitlistEntry.customer.name,
      customerPhone: offer.waitlistEntry.customer.phone ?? undefined,
      serviceId: offer.appointment.serviceId,
      staffMemberId: offer.appointment.staffMemberId,
      startsAt: offer.appointment.startsAt,
      waitlistOfferId: offer.id
    });
  }

  async rejectWaitlistOffer(token: string) {
    const offer = await this.prisma.waitlistOffer.findUnique({
      include: {
        appointment: {
          include: { customer: true, service: true, staffMember: true }
        }
      },
      where: { token }
    });

    if (!offer || offer.status !== WaitlistOfferStatus.PENDING || offer.expiresAt <= new Date()) {
      throw new NotFoundException("Waitlist offer not found");
    }

    await this.rejectWaitlistOfferRecord(offer);

    return { status: "rejected" };
  }

  async listPrivateAppointments(user: AuthenticatedUser) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const appointments = await this.prisma.appointment.findMany({
      include: { customer: true, service: true, staffMember: true },
      orderBy: { startsAt: "asc" },
      where: { businessId: business.id }
    });

    return appointments.map((appointment) => this.serializeAppointment(appointment));
  }

  async getPrivateAppointment(user: AuthenticatedUser, appointmentId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const appointment = await this.prisma.appointment.findFirst({
      include: { customer: true, service: true, staffMember: true },
      where: { businessId: business.id, id: appointmentId }
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    return this.serializeAppointment(appointment);
  }

  confirmPrivateAppointment(user: AuthenticatedUser, appointmentId: string) {
    return this.updatePrivateAppointmentStatusValue(user, appointmentId, "confirmed");
  }

  cancelPrivateAppointment(user: AuthenticatedUser, appointmentId: string) {
    return this.updatePrivateAppointmentStatusValue(user, appointmentId, "cancelled_by_business");
  }

  completePrivateAppointment(user: AuthenticatedUser, appointmentId: string) {
    return this.updatePrivateAppointmentStatusValue(user, appointmentId, "completed");
  }

  markPrivateAppointmentNoShow(user: AuthenticatedUser, appointmentId: string) {
    return this.updatePrivateAppointmentStatusValue(user, appointmentId, "no_show");
  }

  async updatePrivateAppointmentStatus(user: AuthenticatedUser, appointmentId: string, input: UpdateAppointmentStatusDto) {
    return this.updatePrivateAppointmentStatusValue(user, appointmentId, input.status);
  }

  async reschedulePrivateAppointment(user: AuthenticatedUser, appointmentId: string, input: RescheduleAppointmentDto) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const appointment = await this.prisma.appointment.findFirst({
      select: { id: true },
      where: { businessId: business.id, id: appointmentId }
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    return this.rescheduleAppointment({
      appointmentId,
      requestedBy: user,
      source: "dashboard",
      staffMemberId: input.staffMemberId,
      startsAt: input.startsAt
    });
  }

  async getPrivateRescheduleSlots(user: AuthenticatedUser, appointmentId: string, date: string): Promise<AvailabilitySlot[]> {
    const business = await this.businesses.requireCurrentBusiness(user);
    const appointment = await this.prisma.appointment.findFirst({
      select: {
        businessId: true,
        endsAt: true,
        id: true,
        serviceId: true,
        startsAt: true,
        status: true
      },
      where: { businessId: business.id, id: appointmentId }
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    return this.getRescheduleSlotsForAppointment(appointment, date);
  }

  async listPrivateWaitlistEntries(user: AuthenticatedUser) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const entries = await this.prisma.waitlistEntry.findMany({
      include: {
        customer: true,
        offers: {
          orderBy: { createdAt: "desc" },
          take: 3
        },
        service: true
      },
      orderBy: { createdAt: "desc" },
      where: { businessId: business.id }
    });

    return entries.map((entry) => this.serializeWaitlistEntry(entry));
  }

  async createPrivateWaitlistEntry(user: AuthenticatedUser, input: CreateWaitlistEntryDto) {
    const business = await this.businesses.requireCurrentBusiness(user);
    return this.createWaitlistEntryForBusiness(business.id, input);
  }

  async cancelPrivateWaitlistEntry(user: AuthenticatedUser, entryId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const updated = await this.prisma.waitlistEntry.updateMany({
      data: { status: WaitlistStatus.CANCELLED },
      where: {
        businessId: business.id,
        id: entryId,
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] }
      }
    });

    if (updated.count !== 1) {
      throw new NotFoundException("Waitlist entry not found");
    }

    return { status: "cancelled" };
  }

  async acceptPrivateWaitlistOffer(user: AuthenticatedUser, offerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const offer = await this.prisma.waitlistOffer.findFirst({
      include: {
        appointment: true,
        waitlistEntry: {
          include: {
            customer: true
          }
        }
      },
      where: {
        id: offerId,
        waitlistEntry: {
          businessId: business.id
        }
      }
    });

    if (!offer || offer.status !== WaitlistOfferStatus.PENDING || offer.expiresAt <= new Date()) {
      throw new NotFoundException("Waitlist offer not found");
    }

    return this.createAppointmentInTransaction({
      businessId: offer.appointment.businessId,
      customerEmail: offer.waitlistEntry.customer.email,
      customerName: offer.waitlistEntry.customer.name,
      customerPhone: offer.waitlistEntry.customer.phone ?? undefined,
      serviceId: offer.appointment.serviceId,
      staffMemberId: offer.appointment.staffMemberId,
      startsAt: offer.appointment.startsAt,
      waitlistOfferId: offer.id
    });
  }

  async rejectPrivateWaitlistOffer(user: AuthenticatedUser, offerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const offer = await this.prisma.waitlistOffer.findFirst({
      include: {
        appointment: {
          include: { customer: true, service: true, staffMember: true }
        }
      },
      where: {
        id: offerId,
        waitlistEntry: {
          businessId: business.id
        }
      }
    });

    if (!offer || offer.status !== WaitlistOfferStatus.PENDING || offer.expiresAt <= new Date()) {
      throw new NotFoundException("Waitlist offer not found");
    }

    await this.rejectWaitlistOfferRecord(offer);

    return { status: "rejected" };
  }

  private async createWaitlistEntryForBusiness(businessId: string, input: CreateWaitlistEntryDto) {
    const service = await this.prisma.service.findFirst({
      where: { active: true, businessId, id: input.serviceId }
    });

    if (!service) {
      throw new NotFoundException("Service not found");
    }

    const preferredDateStart = parseDateOnly(input.preferredDateStart);
    const preferredDateEnd = parseDateOnly(input.preferredDateEnd);

    if (preferredDateStart > preferredDateEnd) {
      throw new ConflictException("Preferred date range is invalid");
    }

    return this.prisma.$transaction(async (tx) => {
      const customer = await this.upsertCustomer(tx, {
        businessId,
        email: input.customerEmail,
        name: input.customerName,
        phone: input.customerPhone
      });

      const entry = await tx.waitlistEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          earliestTime: input.earliestTime,
          latestTime: input.latestTime,
          preferredDateEnd,
          preferredDateStart,
          priorityScore: Math.max(0, 10 - customer.noShowCount * 2),
          serviceId: service.id
        }
      });

      await this.outbox.create(tx, {
        aggregateId: entry.id,
        businessId,
        payload: {
          businessId,
          customerId: customer.id,
          serviceId: service.id,
          waitlistEntryId: entry.id
        },
        routingKey: EventRoutingKeys.WaitlistEntryCreated,
        type: EventTypes.WaitlistEntryCreated,
        version: 1
      });

      return entry;
    });
  }

  private async rejectWaitlistOfferRecord(offer: WaitlistOfferForRejection) {
    await this.prisma.$transaction(async (tx) => {
      const rejectedOffer = await tx.waitlistOffer.updateMany({
        data: { status: WaitlistOfferStatus.REJECTED },
        where: {
          expiresAt: { gt: new Date() },
          id: offer.id,
          status: WaitlistOfferStatus.PENDING
        }
      });

      if (rejectedOffer.count !== 1) {
        throw new NotFoundException("Waitlist offer not found");
      }

      await tx.waitlistEntry.updateMany({
        data: { status: WaitlistStatus.WAITING },
        where: {
          id: offer.waitlistEntryId,
          status: WaitlistStatus.OFFERED
        }
      });

      await this.outbox.create(tx, {
        aggregateId: offer.appointmentId,
        businessId: offer.appointment.businessId,
        payload: this.waitlistOfferPayload(offer.appointment, {
          status: "rejected",
          waitlistEntryId: offer.waitlistEntryId,
          waitlistOfferId: offer.id
        }),
        routingKey: EventRoutingKeys.WaitlistOfferRejected,
        type: EventTypes.WaitlistOfferRejected,
        version: 1
      });
    });
  }

  private async updatePrivateAppointmentStatusValue(
    user: AuthenticatedUser,
    appointmentId: string,
    status: Extract<PublicAppointmentStatus, "confirmed" | "completed" | "no_show" | "cancelled_by_business">
  ) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const nextStatus = toPrismaAppointmentStatus(status);

    const appointment = await this.prisma.appointment.findFirst({
      include: { customer: true, service: true, staffMember: true },
      where: { businessId: business.id, id: appointmentId }
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        data: { status: nextStatus },
        where: { id: appointment.id }
      });

      const customerCounterUpdate = this.buildCustomerCounterUpdate(appointment.status, nextStatus, appointment.customer);
      if (customerCounterUpdate) {
        await tx.customer.update({
          data: customerCounterUpdate,
          where: { id: appointment.customerId }
        });
      }

      const updated = await tx.appointment.findUniqueOrThrow({
        include: { customer: true, service: true, staffMember: true },
        where: { id: appointment.id }
      });

      await tx.appointmentEvent.create({
        data: {
          appointmentId: appointment.id,
          businessId: business.id,
          eventType: this.appointmentStatusEventType(nextStatus, status),
          metadata: { status }
        }
      });

      if (nextStatus === AppointmentStatus.CONFIRMED) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated, business.timezone),
          routingKey: EventRoutingKeys.AppointmentConfirmed,
          type: EventTypes.AppointmentConfirmed,
          version: 1
        });
      }

      if (nextStatus === AppointmentStatus.COMPLETED) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated, business.timezone),
          routingKey: EventRoutingKeys.AppointmentCompleted,
          type: EventTypes.AppointmentCompleted,
          version: 1
        });
      }

      if (nextStatus === AppointmentStatus.NO_SHOW) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated, business.timezone),
          routingKey: EventRoutingKeys.AppointmentMarkedAsNoShow,
          type: EventTypes.AppointmentMarkedAsNoShow,
          version: 1
        });
      }

      if (nextStatus === AppointmentStatus.CANCELLED_BY_BUSINESS) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated, business.timezone),
          routingKey: EventRoutingKeys.AppointmentCancelled,
          type: EventTypes.AppointmentCancelled,
          version: 1
        });

        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated, business.timezone),
          routingKey: EventRoutingKeys.SlotReleased,
          type: EventTypes.SlotReleased,
          version: 1
        });
      }

      return updated;
    });

    return this.serializeAppointment(updatedAppointment);
  }

  private async rescheduleAppointment(input: {
    appointmentId: string;
    startsAt: string;
    staffMemberId: string | undefined;
    requestedBy: AuthenticatedUser | null;
    source: "dashboard" | "public";
  }) {
    const startsAt = new Date(input.startsAt);

    if (Number.isNaN(startsAt.getTime())) {
      throw new ConflictException("Invalid appointment start date");
    }

    if (startsAt <= new Date()) {
      throw new ConflictException("Cannot reschedule an appointment to the past");
    }

    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        const current = await tx.appointment.findUnique({
          include: { customer: true, service: true, staffMember: true },
          where: { id: input.appointmentId }
        });

        if (!current) {
          throw new NotFoundException("Appointment not found");
        }

        if (!activeAppointmentStatuses.includes(current.status)) {
          throw new ConflictException("Only active appointments can be rescheduled");
        }

        if (startsAt.getTime() === current.startsAt.getTime()) {
          throw new ConflictException("Choose a different appointment time");
        }

        const business = await tx.business.findUniqueOrThrow({
          select: { timezone: true },
          where: { id: current.businessId }
        });

        const staffMemberId = input.staffMemberId ?? current.staffMemberId;
        await this.assertStaffMemberCanTakeSlot(
          tx,
          current.businessId,
          current.serviceId,
          staffMemberId,
          startsAt,
          current.id
        );

        const endsAt = new Date(startsAt.getTime() + (current.service.durationMinutes + current.service.bufferMinutes) * 60_000);
        await this.assertBusinessSlotIsFree(tx, current.businessId, startsAt, endsAt, current.id);

        const updated = await tx.appointment.update({
          data: {
            endsAt,
            staffMemberId,
            startsAt
          },
          include: { customer: true, service: true, staffMember: true },
          where: { id: current.id }
        });

        await tx.appointmentEvent.create({
          data: {
            appointmentId: current.id,
            businessId: current.businessId,
            eventType: EventTypes.AppointmentRescheduled,
            metadata: {
              fromEndsAt: current.endsAt.toISOString(),
              fromStartsAt: current.startsAt.toISOString(),
              source: input.source,
              toEndsAt: updated.endsAt.toISOString(),
              toStartsAt: updated.startsAt.toISOString()
            }
          }
        });

        await this.audit.create(tx, {
          action: "appointment.rescheduled",
          after: this.appointmentPayload(updated, business.timezone),
          before: this.appointmentPayload(current, business.timezone),
          businessId: current.businessId,
          entity: "appointment",
          entityId: current.id,
          metadata: { source: input.source },
          user: input.requestedBy
        });

        await this.outbox.create(tx, {
          aggregateId: current.id,
          businessId: current.businessId,
          payload: {
            ...this.appointmentPayload(updated, business.timezone),
            previousEndsAt: current.endsAt.toISOString(),
            previousStartsAt: current.startsAt.toISOString(),
            source: input.source
          },
          routingKey: EventRoutingKeys.AppointmentRescheduled,
          type: EventTypes.AppointmentRescheduled,
          version: 1
        });

        return updated;
      });

      return this.serializeAppointment(appointment);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new ConflictException("Appointment slot is no longer available");
    }
  }

  private async createAppointmentInTransaction(input: {
    businessId: string;
    serviceId: string;
    staffMemberId: string | undefined;
    startsAt: Date;
    customerName: string;
    customerEmail: string;
    customerPhone: string | undefined;
    waitlistOfferId?: string;
  }) {
    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        const business = await tx.business.findUniqueOrThrow({
          select: { timezone: true },
          where: { id: input.businessId }
        });

        if (input.waitlistOfferId) {
          const acceptedOffer = await tx.waitlistOffer.updateMany({
            data: { status: WaitlistOfferStatus.ACCEPTED },
            where: {
              expiresAt: { gt: new Date() },
              id: input.waitlistOfferId,
              status: WaitlistOfferStatus.PENDING
            }
          });

          if (acceptedOffer.count !== 1) {
            throw new NotFoundException("Waitlist offer not found");
          }
        }

        const service = await tx.service.findFirst({
          where: { active: true, businessId: input.businessId, id: input.serviceId }
        });

        if (!service) {
          throw new NotFoundException("Service not found");
        }

        const staffMemberId =
          input.staffMemberId ?? (await this.selectAvailableStaffMember(tx, input.businessId, service.id, input.startsAt));
        await this.assertStaffMemberCanTakeSlot(tx, input.businessId, service.id, staffMemberId, input.startsAt);
        const endsAt = new Date(input.startsAt.getTime() + (service.durationMinutes + service.bufferMinutes) * 60_000);
        const customer = await this.upsertCustomer(tx, {
          businessId: input.businessId,
          email: input.customerEmail,
          name: input.customerName,
          phone: input.customerPhone
        });

        const appointment = await tx.appointment.create({
          data: {
            businessId: input.businessId,
            cancellationToken: createPublicToken(),
            customerId: customer.id,
            endsAt,
            serviceId: service.id,
            staffMemberId,
            startsAt: input.startsAt
          },
          include: { customer: true, service: true, staffMember: true }
        });

        await tx.customer.update({
          data: { totalAppointments: { increment: 1 } },
          where: { id: customer.id }
        });

        if (input.waitlistOfferId) {
          await tx.waitlistEntry.updateMany({
            data: { status: WaitlistStatus.BOOKED },
            where: { offers: { some: { id: input.waitlistOfferId } } }
          });
        }

        await tx.appointmentEvent.create({
          data: {
            appointmentId: appointment.id,
            businessId: input.businessId,
            eventType: EventTypes.AppointmentBooked,
            metadata: { source: input.waitlistOfferId ? "waitlist_offer" : "public_booking" }
          }
        });

        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: input.businessId,
          payload: this.appointmentPayload(appointment, business.timezone),
          routingKey: EventRoutingKeys.AppointmentBooked,
          type: EventTypes.AppointmentBooked,
          version: 1
        });

        if (input.waitlistOfferId) {
          await this.outbox.create(tx, {
            aggregateId: input.waitlistOfferId,
            businessId: input.businessId,
            payload: this.waitlistOfferPayload(appointment, {
              status: "accepted",
              waitlistOfferId: input.waitlistOfferId
            }),
            routingKey: EventRoutingKeys.WaitlistOfferAccepted,
            type: EventTypes.WaitlistOfferAccepted,
            version: 1
          });

          await this.outbox.create(tx, {
            aggregateId: appointment.id,
            businessId: input.businessId,
            payload: this.waitlistOfferPayload(appointment, {
              status: "accepted",
              waitlistOfferId: input.waitlistOfferId
            }),
            routingKey: EventRoutingKeys.SlotReassigned,
            type: EventTypes.SlotReassigned,
            version: 1
          });
        }

        return appointment;
      });

      return this.serializeAppointment(appointment);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new ConflictException("Appointment slot is no longer available");
    }
  }

  private async selectAvailableStaffMember(
    tx: Prisma.TransactionClient,
    businessId: string,
    serviceId: string,
    startsAt: Date
  ): Promise<string> {
    const service = await tx.service.findUniqueOrThrow({ where: { id: serviceId } });
    const date = await this.dateOnlyForBusiness(tx, businessId, startsAt);
    const slots = await this.getAvailabilityForTransaction(tx, businessId, serviceId, date);
    const matchingSlot = slots.find((slot) => slot.startsAt.getTime() === startsAt.getTime());

    if (!matchingSlot) {
      throw new ConflictException("No staff member is available at the requested time");
    }

    const slotEnd = new Date(matchingSlot.startsAt.getTime() + (service.durationMinutes + service.bufferMinutes) * 60_000);
    if (slotEnd.getTime() !== matchingSlot.endsAt.getTime()) {
      throw new ConflictException("Requested slot does not match service duration");
    }

    return matchingSlot.staffMemberId;
  }

  private async assertStaffMemberCanTakeSlot(
    tx: Prisma.TransactionClient,
    businessId: string,
    serviceId: string,
    staffMemberId: string,
    startsAt: Date,
    excludeAppointmentId?: string
  ): Promise<void> {
    const staffMember = await tx.staffMember.findFirst({
      where: {
        active: true,
        businessId,
        id: staffMemberId
      }
    });

    if (!staffMember) {
      throw new NotFoundException("Staff member not found");
    }

    const date = await this.dateOnlyForBusiness(tx, businessId, startsAt);
    const slots = await this.getAvailabilityForTransaction(tx, businessId, serviceId, date, excludeAppointmentId);
    const matchingSlot = slots.find(
      (slot) => slot.staffMemberId === staffMemberId && slot.startsAt.getTime() === startsAt.getTime()
    );

    if (!matchingSlot) {
      throw new ConflictException("Staff member is not available at the requested time");
    }
  }

  private async getRescheduleSlotsForAppointment(
    appointment: {
      businessId: string;
      endsAt: Date;
      id: string;
      serviceId: string;
      startsAt: Date;
      status: AppointmentStatus;
    },
    date: string
  ): Promise<AvailabilitySlot[]> {
    if (!activeAppointmentStatuses.includes(appointment.status)) {
      throw new ConflictException("Only active appointments can be rescheduled");
    }

    const now = new Date();
    const { occupiedAppointments, slots } = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.findUniqueOrThrow({
        select: { timezone: true },
        where: { id: appointment.businessId }
      });
      const dayBounds = zonedDayBounds(date, business.timezone);
      const availableSlots = await this.getAvailabilityForTransaction(tx, appointment.businessId, appointment.serviceId, date, appointment.id);
      const activeAppointments = await tx.appointment.findMany({
        select: {
          endsAt: true,
          startsAt: true
        },
        where: {
          businessId: appointment.businessId,
          startsAt: { lt: dayBounds.end },
          status: { in: activeAppointmentStatuses },
          endsAt: { gt: dayBounds.start }
        }
      });

      return {
        occupiedAppointments: activeAppointments,
        slots: availableSlots
      };
    });

    const availableBusinessSlots = slots.filter((slot) => {
      return slot.startsAt > now && !occupiedAppointments.some((occupiedAppointment) => (
        slot.startsAt < occupiedAppointment.endsAt &&
        slot.endsAt > occupiedAppointment.startsAt
      ));
    });

    return this.uniqueSlotsByStartTime(availableBusinessSlots);
  }

  private uniqueSlotsByStartTime(slots: AvailabilitySlot[]): AvailabilitySlot[] {
    const uniqueSlots = new Map<number, AvailabilitySlot>();

    for (const slot of slots) {
      if (!uniqueSlots.has(slot.startsAt.getTime())) {
        uniqueSlots.set(slot.startsAt.getTime(), slot);
      }
    }

    return [...uniqueSlots.values()];
  }

  private async assertBusinessSlotIsFree(
    tx: Prisma.TransactionClient,
    businessId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId: string
  ): Promise<void> {
    const overlappingAppointment = await tx.appointment.findFirst({
      select: { id: true },
      where: {
        businessId,
        id: { not: excludeAppointmentId },
        startsAt: { lt: endsAt },
        status: { in: activeAppointmentStatuses },
        endsAt: { gt: startsAt }
      }
    });

    if (overlappingAppointment) {
      throw new ConflictException("Appointment slot is already occupied");
    }
  }

  private async getAvailabilityForTransaction(
    tx: Prisma.TransactionClient,
    businessId: string,
    serviceId: string,
    date: string,
    excludeAppointmentId?: string
  ): Promise<AvailabilitySlot[]> {
    const requestedDate = parseDateOnly(date);
    const service = await tx.service.findUniqueOrThrow({ where: { id: serviceId } });
    const business = await tx.business.findUniqueOrThrow({
      select: { timezone: true },
      where: { id: businessId }
    });
    const dayBounds = zonedDayBounds(date, business.timezone);

    const [activeStaffMembers, rules, exceptions, busySlots] = await Promise.all([
      tx.staffMember.findMany({
        select: { id: true },
        where: { active: true, businessId }
      }),
      tx.availabilityRule.findMany({
        select: {
          endTime: true,
          staffMemberId: true,
          startTime: true
        },
        where: {
          active: true,
          businessId,
          staffMember: { active: true },
          weekday: weekdayUtc(requestedDate)
        }
      }),
      tx.availabilityException.findMany({
        select: {
          endTime: true,
          staffMemberId: true,
          startTime: true,
          type: true
        },
        where: {
          businessId,
          date: requestedDate,
          OR: [{ staffMemberId: null }, { staffMember: { active: true } }]
        }
      }),
      tx.appointment.findMany({
        select: {
          endsAt: true,
          staffMemberId: true,
          startsAt: true
        },
        where: {
          businessId,
          id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
          startsAt: { lt: dayBounds.end },
          status: { in: activeAppointmentStatuses },
          endsAt: { gt: dayBounds.start }
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

  private async dateOnlyForBusiness(tx: Prisma.TransactionClient, businessId: string, startsAt: Date): Promise<string> {
    const business = await tx.business.findUniqueOrThrow({
      select: { timezone: true },
      where: { id: businessId }
    });

    return dateOnlyInTimeZone(startsAt, business.timezone);
  }

  private async upsertCustomer(
    client: Prisma.TransactionClient | PrismaService,
    input: {
      businessId: string;
      email: string;
      name: string;
      phone?: string;
    }
  ) {
    return client.customer.upsert({
      create: {
        businessId: input.businessId,
        email: input.email.toLowerCase(),
        name: input.name,
        phone: input.phone
      },
      update: {
        name: input.name,
        phone: input.phone
      },
      where: {
        businessId_email: {
          businessId: input.businessId,
          email: input.email.toLowerCase()
        }
      }
    });
  }

  private appointmentPayload(
    appointment: AppointmentWithRelations,
    timezone = DEFAULT_BUSINESS_TIMEZONE
  ): Prisma.InputJsonObject {
    return {
      appointmentId: appointment.id,
      businessId: appointment.businessId,
      cancellationToken: appointment.cancellationToken,
      customer: {
        completedAppointments: appointment.customer.completedAppointments,
        email: appointment.customer.email,
        id: appointment.customer.id,
        name: appointment.customer.name,
        noShowCount: appointment.customer.noShowCount,
        phone: appointment.customer.phone,
        requiresDeposit: appointment.customer.requiresDeposit,
        riskLevel: appointment.customer.riskLevel.toLowerCase(),
        riskScore: appointment.customer.riskScore,
        totalAppointments: appointment.customer.totalAppointments
      },
      endsAt: appointment.endsAt.toISOString(),
      service: {
        durationMinutes: appointment.service.durationMinutes,
        id: appointment.service.id,
        name: appointment.service.name,
        priceCents: appointment.service.priceCents
      },
      staffMember: {
        id: appointment.staffMember.id,
        name: appointment.staffMember.name
      },
      startsAt: appointment.startsAt.toISOString(),
      status: fromPrismaAppointmentStatus(appointment.status),
      timezone
    };
  }

  private waitlistOfferPayload(
    appointment: AppointmentWithRelations,
    input: {
      status: "accepted" | "expired" | "rejected";
      waitlistEntryId?: string;
      waitlistOfferId: string;
    }
  ): Prisma.InputJsonObject {
    return {
      ...this.appointmentPayload(appointment),
      waitlistEntryId: input.waitlistEntryId,
      waitlistOfferId: input.waitlistOfferId,
      waitlistOfferStatus: input.status
    };
  }

  private serializeAppointment(appointment: AppointmentWithRelations) {
    return {
      cancellationToken: appointment.cancellationToken,
      customer: {
        completedAppointments: appointment.customer.completedAppointments,
        email: appointment.customer.email,
        id: appointment.customer.id,
        name: appointment.customer.name,
        noShowCount: appointment.customer.noShowCount,
        phone: appointment.customer.phone,
        requiresDeposit: appointment.customer.requiresDeposit,
        riskLevel: appointment.customer.riskLevel.toLowerCase(),
        riskScore: appointment.customer.riskScore,
        totalAppointments: appointment.customer.totalAppointments
      },
      endsAt: appointment.endsAt,
      id: appointment.id,
      service: appointment.service,
      staffMember: appointment.staffMember,
      startsAt: appointment.startsAt,
      status: fromPrismaAppointmentStatus(appointment.status)
    };
  }

  private serializeWaitlistEntry(entry: WaitlistEntryWithRelations) {
    return {
      customer: {
        email: entry.customer.email,
        id: entry.customer.id,
        name: entry.customer.name,
        phone: entry.customer.phone,
        riskLevel: entry.customer.riskLevel.toLowerCase(),
        riskScore: entry.customer.riskScore
      },
      earliestTime: entry.earliestTime,
      id: entry.id,
      latestTime: entry.latestTime,
      offers: entry.offers.map((offer) => ({
        appointmentId: offer.appointmentId,
        expiresAt: offer.expiresAt,
        id: offer.id,
        status: offer.status.toLowerCase()
      })),
      preferredDateEnd: entry.preferredDateEnd,
      preferredDateStart: entry.preferredDateStart,
      priorityScore: entry.priorityScore,
      service: entry.service,
      status: entry.status.toLowerCase()
    };
  }

  private appointmentStatusEventType(
    nextStatus: AppointmentStatus,
    publicStatus: Extract<PublicAppointmentStatus, "confirmed" | "completed" | "no_show" | "cancelled_by_business">
  ) {
    if (nextStatus === AppointmentStatus.CONFIRMED) {
      return EventTypes.AppointmentConfirmed;
    }
    if (nextStatus === AppointmentStatus.COMPLETED) {
      return EventTypes.AppointmentCompleted;
    }
    if (nextStatus === AppointmentStatus.NO_SHOW) {
      return EventTypes.AppointmentMarkedAsNoShow;
    }
    if (nextStatus === AppointmentStatus.CANCELLED_BY_BUSINESS) {
      return EventTypes.AppointmentCancelled;
    }

    return `appointment.${publicStatus}.v1`;
  }

  private buildCustomerCounterUpdate(
    previousStatus: AppointmentStatus,
    nextStatus: AppointmentStatus,
    customer: AppointmentWithRelations["customer"]
  ): Prisma.CustomerUpdateInput | undefined {
    const noShowDelta = this.statusDelta(previousStatus, nextStatus, AppointmentStatus.NO_SHOW);
    const completedDelta = this.statusDelta(previousStatus, nextStatus, AppointmentStatus.COMPLETED);

    if (noShowDelta === 0 && completedDelta === 0) {
      return undefined;
    }

    return {
      completedAppointments: Math.max(0, customer.completedAppointments + completedDelta),
      noShowCount: Math.max(0, customer.noShowCount + noShowDelta)
    };
  }

  private statusDelta(previousStatus: AppointmentStatus, nextStatus: AppointmentStatus, trackedStatus: AppointmentStatus) {
    if (previousStatus === trackedStatus && nextStatus !== trackedStatus) {
      return -1;
    }
    if (previousStatus !== trackedStatus && nextStatus === trackedStatus) {
      return 1;
    }

    return 0;
  }
}
