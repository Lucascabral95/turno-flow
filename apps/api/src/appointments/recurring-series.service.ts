import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, RecurringSeriesStatus } from "@prisma/client";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { getCorrelationId } from "../common/correlation-id";
import { createPublicToken } from "../common/tokens";
import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateRecurringSeriesDto, UpdateRecurringSeriesDto } from "./dto/recurring-series.dto";
import { AppointmentsService } from "./appointments.service";

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

const seriesInclude = {
  customer: { select: { email: true, id: true, name: true } },
  service: { select: { durationMinutes: true, id: true, name: true } },
  staffMember: { select: { id: true, name: true } }
} as const;

const activeAppointmentStatuses = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

function addInterval(date: Date, unit: string, value: number, count: number): Date {
  const result = new Date(date);
  const total = value * count;
  if (unit === "DAY") {
    result.setUTCDate(result.getUTCDate() + total);
  } else if (unit === "WEEK") {
    result.setUTCDate(result.getUTCDate() + total * 7);
  } else {
    result.setUTCMonth(result.getUTCMonth() + total);
  }
  return result;
}

@Injectable()
export class RecurringSeriesService {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService
  ) {}

  async createSeries(user: AuthenticatedUser, dto: CreateRecurringSeriesDto) {
    const businessId = user.businessId!;

    const [customer, service, staffMember, business] = await Promise.all([
      this.prisma.customer.findFirst({ where: { id: dto.customerId, businessId } }),
      this.prisma.service.findFirst({ where: { id: dto.serviceId, businessId, active: true } }),
      this.prisma.staffMember.findFirst({ where: { id: dto.staffMemberId, businessId, active: true } }),
      this.prisma.business.findUnique({ select: { timezone: true }, where: { id: businessId } })
    ]);

    if (!customer) throw new NotFoundException("Customer not found");
    if (!service) throw new NotFoundException("Service not found");
    if (!staffMember) throw new NotFoundException("Staff member not found");

    const timezone = business?.timezone ?? DEFAULT_TIMEZONE;
    const firstOccurrence = new Date(dto.firstOccurrenceAt);
    const durationMs = (service.durationMinutes + (service.bufferMinutes ?? 0)) * 60_000;
    const lastOccurrence = addInterval(firstOccurrence, dto.intervalUnit, dto.intervalValue, dto.maxOccurrences - 1);
    const nextOccurrenceAt = addInterval(lastOccurrence, dto.intervalUnit, dto.intervalValue, 1);

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.recurringAppointmentSeries.create({
        data: {
          advanceNoticeDays: 0,
          businessId,
          customerId: dto.customerId,
          intervalUnit: dto.intervalUnit,
          intervalValue: dto.intervalValue,
          maxOccurrences: dto.maxOccurrences,
          nextOccurrenceAt,
          occurrencesCreated: dto.maxOccurrences,
          serviceId: dto.serviceId,
          staffMemberId: dto.staffMemberId,
          status: RecurringSeriesStatus.ACTIVE
        },
        include: seriesInclude
      });

      for (let i = 0; i < dto.maxOccurrences; i++) {
        const startsAt = addInterval(firstOccurrence, dto.intervalUnit, dto.intervalValue, i);
        const endsAt = new Date(startsAt.getTime() + durationMs);

        await this.appointments.assertStaffMemberCanTakeSlot(
          tx,
          businessId,
          dto.serviceId,
          dto.staffMemberId,
          startsAt
        );

        const appointment = await tx.appointment.create({
          data: {
            businessId,
            cancellationToken: createPublicToken(),
            customerId: customer.id,
            endsAt,
            recurringSeriesId: series.id,
            serviceId: service.id,
            staffMemberId: staffMember.id,
            startsAt
          },
          include: { customer: true, service: true, staffMember: true }
        });

        await tx.customer.update({
          data: { totalAppointments: { increment: 1 } },
          where: { id: customer.id }
        });

        await tx.appointmentEvent.create({
          data: {
            appointmentId: appointment.id,
            businessId,
            eventType: EventTypes.AppointmentBooked,
            metadata: { source: "recurring_series" }
          }
        });

        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId,
          payload: this.buildAppointmentPayload(appointment, timezone),
          routingKey: EventRoutingKeys.AppointmentBooked,
          type: EventTypes.AppointmentBooked,
          version: 1
        });
      }

      await this.outbox.create(tx, {
        aggregateId: series.id,
        businessId,
        payload: {
          businessId,
          customerEmail: customer.email,
          intervalUnit: dto.intervalUnit,
          intervalValue: dto.intervalValue,
          maxOccurrences: dto.maxOccurrences,
          nextOccurrenceAt: nextOccurrenceAt.toISOString(),
          seriesId: series.id,
          serviceName: service.name,
          staffMemberName: staffMember.name
        },
        routingKey: EventRoutingKeys.RecurringSeriesCreated,
        type: EventTypes.RecurringSeriesCreated,
        version: 1
      });

      return series;
    });
  }

  async listSeries(user: AuthenticatedUser, status?: RecurringSeriesStatus) {
    return this.prisma.recurringAppointmentSeries.findMany({
      include: seriesInclude,
      orderBy: { nextOccurrenceAt: "asc" },
      where: {
        businessId: user.businessId!,
        ...(status ? { status } : {})
      }
    });
  }

  async getSeries(user: AuthenticatedUser, id: string) {
    const series = await this.prisma.recurringAppointmentSeries.findFirst({
      include: {
        ...seriesInclude,
        appointments: {
          orderBy: { startsAt: "desc" },
          select: {
            customer: { select: { id: true, name: true } },
            endsAt: true,
            id: true,
            service: { select: { id: true, name: true } },
            staffMember: { select: { id: true, name: true } },
            startsAt: true,
            status: true
          },
          take: 10
        }
      },
      where: { businessId: user.businessId!, id }
    });

    if (!series) throw new NotFoundException("Recurring series not found");
    return series;
  }

  async updateSeries(user: AuthenticatedUser, id: string, dto: UpdateRecurringSeriesDto) {
    const existing = await this.prisma.recurringAppointmentSeries.findFirst({
      where: { businessId: user.businessId!, id }
    });

    if (!existing) throw new NotFoundException("Recurring series not found");

    if (
      existing.status === RecurringSeriesStatus.CANCELLED ||
      existing.status === RecurringSeriesStatus.COMPLETED
    ) {
      throw new ForbiddenException("Cannot update a cancelled or completed series");
    }

    return this.prisma.recurringAppointmentSeries.update({
      data: {
        ...(dto.advanceNoticeDays !== undefined ? { advanceNoticeDays: dto.advanceNoticeDays } : {}),
        ...(dto.maxOccurrences !== undefined ? { maxOccurrences: dto.maxOccurrences } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {})
      },
      include: seriesInclude,
      where: { id }
    });
  }

  async cancelSeries(user: AuthenticatedUser, id: string) {
    const businessId = user.businessId!;

    const [series, business] = await Promise.all([
      this.prisma.recurringAppointmentSeries.findFirst({ where: { businessId, id } }),
      this.prisma.business.findUnique({ select: { timezone: true }, where: { id: businessId } })
    ]);

    if (!series) throw new NotFoundException("Recurring series not found");
    if (series.status === RecurringSeriesStatus.CANCELLED) {
      throw new ForbiddenException("Series is already cancelled");
    }

    const timezone = business?.timezone ?? DEFAULT_TIMEZONE;
    const now = new Date();

    // Read all future appointments with full relations OUTSIDE the transaction.
    // Building payloads in memory avoids N round-trips inside the transaction.
    const futureAppointments = await this.prisma.appointment.findMany({
      include: { customer: true, service: true, staffMember: true },
      where: {
        businessId,
        recurringSeriesId: id,
        startsAt: { gt: now },
        status: { in: activeAppointmentStatuses }
      }
    });

    if (futureAppointments.length === 0) {
      await this.prisma.recurringAppointmentSeries.update({
        data: { status: RecurringSeriesStatus.CANCELLED },
        where: { id }
      });
      return { cancelledAppointments: 0, id };
    }

    const appointmentIds = futureAppointments.map((a) => a.id);
    const count = appointmentIds.length;
    const correlationId = getCorrelationId();

    // Build all outbox rows and event rows in memory — no DB calls.
    const outboxRows = futureAppointments.flatMap((appt) => {
      const payload = this.buildAppointmentPayload(
        { ...appt, status: AppointmentStatus.CANCELLED_BY_BUSINESS },
        timezone
      );
      return [
        {
          aggregateId: appt.id,
          businessId,
          correlationId,
          payload,
          routingKey: EventRoutingKeys.AppointmentCancelled,
          type: EventTypes.AppointmentCancelled,
          version: 1
        },
        {
          aggregateId: appt.id,
          businessId,
          correlationId,
          payload,
          routingKey: EventRoutingKeys.SlotReleased,
          type: EventTypes.SlotReleased,
          version: 1
        }
      ];
    });

    const appointmentEventRows = futureAppointments.map((appt) => ({
      appointmentId: appt.id,
      businessId,
      eventType: EventTypes.AppointmentCancelled,
      metadata: { cancelledBy: "business", reason: "recurring_series_cancelled" }
    }));

    // 5 queries total inside the transaction, regardless of how many appointments.
    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.updateMany({
        data: { status: AppointmentStatus.CANCELLED_BY_BUSINESS },
        where: { id: { in: appointmentIds } }
      });

      await tx.customer.update({
        data: {
          cancelledAppointments: { increment: count },
          totalAppointments: { decrement: count }
        },
        where: { id: series.customerId }
      });

      await tx.appointmentEvent.createMany({ data: appointmentEventRows });

      await tx.eventOutbox.createMany({ data: outboxRows });

      await tx.recurringAppointmentSeries.update({
        data: { status: RecurringSeriesStatus.CANCELLED },
        where: { id }
      });
    });

    return { cancelledAppointments: count, id };
  }

  private buildAppointmentPayload(
    appointment: {
      businessId: string;
      cancellationToken: string;
      customer: {
        completedAppointments: number;
        email: string;
        id: string;
        name: string;
        noShowCount: number;
        phone: string | null;
        requiresDeposit: boolean;
        riskLevel: string;
        riskScore: number;
        totalAppointments: number;
      };
      endsAt: Date;
      id: string;
      service: { durationMinutes: number; id: string; name: string; priceCents: number };
      staffMember: { id: string; name: string };
      startsAt: Date;
      status: AppointmentStatus;
    },
    timezone: string
  ) {
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
      status: appointment.status.toLowerCase(),
      timezone
    };
  }
}
