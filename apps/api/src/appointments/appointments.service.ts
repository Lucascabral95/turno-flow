import { ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, Prisma, WaitlistOfferStatus, WaitlistStatus } from "@prisma/client";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { createPublicToken } from "../common/tokens";
import { dateOnly, parseDateOnly, weekdayUtc } from "../common/time";
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
  UpdateAppointmentStatusDto
} from "./dto/appointment.dto";

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: {
    customer: true;
    service: true;
    staffMember: true;
  };
}>;

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
          startsAt: { lt: nextDate },
          status: { in: activeAppointmentStatuses },
          endsAt: { gt: requestedDate }
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
        payload: this.appointmentPayload(updatedAppointment),
        routingKey: EventRoutingKeys.AppointmentCancelled,
        type: EventTypes.AppointmentCancelled,
        version: 1
      });

      await this.outbox.create(tx, {
        aggregateId: appointment.id,
        businessId: appointment.businessId,
        payload: this.appointmentPayload(updatedAppointment),
        routingKey: EventRoutingKeys.SlotReleased,
        type: EventTypes.SlotReleased,
        version: 1
      });

      return updatedAppointment;
    });

    return this.serializeAppointment(cancelledAppointment);
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
          payload: this.appointmentPayload(updated),
          routingKey: EventRoutingKeys.AppointmentConfirmed,
          type: EventTypes.AppointmentConfirmed,
          version: 1
        });
      }

      if (nextStatus === AppointmentStatus.COMPLETED) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated),
          routingKey: EventRoutingKeys.AppointmentCompleted,
          type: EventTypes.AppointmentCompleted,
          version: 1
        });
      }

      if (nextStatus === AppointmentStatus.NO_SHOW) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated),
          routingKey: EventRoutingKeys.AppointmentMarkedAsNoShow,
          type: EventTypes.AppointmentMarkedAsNoShow,
          version: 1
        });
      }

      if (nextStatus === AppointmentStatus.CANCELLED_BY_BUSINESS) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated),
          routingKey: EventRoutingKeys.AppointmentCancelled,
          type: EventTypes.AppointmentCancelled,
          version: 1
        });

        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId: business.id,
          payload: this.appointmentPayload(updated),
          routingKey: EventRoutingKeys.SlotReleased,
          type: EventTypes.SlotReleased,
          version: 1
        });
      }

      return updated;
    });

    return this.serializeAppointment(updatedAppointment);
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
          payload: this.appointmentPayload(appointment),
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
    const date = dateOnly(startsAt);
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
    startsAt: Date
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

    const slots = await this.getAvailabilityForTransaction(tx, businessId, serviceId, dateOnly(startsAt));
    const matchingSlot = slots.find(
      (slot) => slot.staffMemberId === staffMemberId && slot.startsAt.getTime() === startsAt.getTime()
    );

    if (!matchingSlot) {
      throw new ConflictException("Staff member is not available at the requested time");
    }
  }

  private async getAvailabilityForTransaction(
    tx: Prisma.TransactionClient,
    businessId: string,
    serviceId: string,
    date: string
  ): Promise<AvailabilitySlot[]> {
    const requestedDate = parseDateOnly(date);
    const nextDate = new Date(requestedDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const service = await tx.service.findUniqueOrThrow({ where: { id: serviceId } });

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
          startsAt: { lt: nextDate },
          status: { in: activeAppointmentStatuses },
          endsAt: { gt: requestedDate }
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

  private appointmentPayload(appointment: AppointmentWithRelations): Prisma.InputJsonObject {
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
      status: fromPrismaAppointmentStatus(appointment.status)
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
