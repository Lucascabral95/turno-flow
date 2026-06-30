import { AppointmentStatus, WaitlistOfferStatus, WaitlistStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { AppointmentsService } from "./appointments.service";

type EventOutboxCreateInput = {
  data: {
    aggregateId: string;
    businessId: string;
    payload: unknown;
    routingKey: string;
    type: string;
    version: number;
  };
};

type WaitlistEntryUpdateManyInput = {
  data: {
    status: WaitlistStatus;
  };
  where: {
    id: string;
    status: WaitlistStatus;
  };
};

type WaitlistOfferUpdateManyInput = {
  data: {
    status: WaitlistOfferStatus;
  };
  where: {
    expiresAt: {
      gt: Date;
    };
    id: string;
    status: WaitlistOfferStatus;
  };
};

type TransactionMock = {
  eventOutbox: {
    create: (input: EventOutboxCreateInput) => Promise<unknown>;
  };
  waitlistEntry: {
    updateMany: (input: WaitlistEntryUpdateManyInput) => Promise<{ count: number }>;
  };
  waitlistOffer: {
    updateMany: (input: WaitlistOfferUpdateManyInput) => Promise<{ count: number }>;
  };
};

type AppointmentFindManyInput = {
  select?: {
    endsAt?: boolean;
    staffMemberId?: boolean;
    startsAt?: boolean;
  };
  where?: {
    businessId?: string;
    endsAt?: { gt: Date };
    id?: { not: string };
    startsAt?: { lt: Date };
    status?: { in: AppointmentStatus[] };
  };
};

type AppointmentFindManyOutput = Array<{
  endsAt: Date;
  staffMemberId?: string;
  startsAt: Date;
}>;

describe("AppointmentsService", () => {
  const audit = {
    create: vi.fn()
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not offer the current appointment time or occupied same-day times when rescheduling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T14:00:00.000Z"));

    const currentAppointment = {
      businessId: "business-1",
      cancellationToken: "cancel-token",
      endsAt: new Date("2026-06-29T19:00:00.000Z"),
      id: "appointment-current",
      serviceId: "service-1",
      startsAt: new Date("2026-06-29T18:30:00.000Z"),
      status: AppointmentStatus.CONFIRMED
    };
    const tx = {
      appointment: {
        findMany: vi
          .fn<(input: AppointmentFindManyInput) => Promise<AppointmentFindManyOutput>>()
          .mockResolvedValueOnce([
            {
              endsAt: new Date("2026-06-29T16:30:00.000Z"),
              staffMemberId: "staff-1",
              startsAt: new Date("2026-06-29T16:00:00.000Z")
            },
            {
              endsAt: new Date("2026-06-29T18:30:00.000Z"),
              staffMemberId: "staff-2",
              startsAt: new Date("2026-06-29T17:30:00.000Z")
            }
          ])
          .mockResolvedValueOnce([
            {
              endsAt: new Date("2026-06-29T19:00:00.000Z"),
              startsAt: new Date("2026-06-29T18:30:00.000Z")
            },
            {
              endsAt: new Date("2026-06-29T16:30:00.000Z"),
              startsAt: new Date("2026-06-29T16:00:00.000Z")
            },
            {
              endsAt: new Date("2026-06-29T18:30:00.000Z"),
              startsAt: new Date("2026-06-29T17:30:00.000Z")
            }
          ])
      },
      availabilityException: {
        findMany: vi.fn().mockResolvedValue([])
      },
      availabilityRule: {
        findMany: vi.fn().mockResolvedValue([
          {
            endTime: "16:00",
            staffMemberId: "staff-1",
            startTime: "12:00"
          },
          {
            endTime: "16:00",
            staffMemberId: "staff-2",
            startTime: "12:00"
          }
        ])
      },
      business: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires" })
      },
      service: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          bufferMinutes: 0,
          durationMinutes: 30,
          id: "service-1"
        })
      },
      serviceStaffMember: {
        findMany: vi.fn().mockResolvedValue([])
      },
      staffMember: {
        findMany: vi.fn().mockResolvedValue([{ id: "staff-1" }, { id: "staff-2" }])
      }
    };
    const prisma = {
      appointment: {
        findUnique: vi.fn().mockResolvedValue(currentAppointment)
      },
      $transaction: vi.fn((fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx))
    };
    const service = new AppointmentsService(audit as never, {} as never, new OutboxService(), prisma as never);

    const slots = await service.getPublicRescheduleSlots("appointment-current", { token: "cancel-token" }, "2026-06-29");
    const startsAt = slots.map((slot) => slot.startsAt.toISOString());

    expect(startsAt).toEqual([
      "2026-06-29T15:00:00.000Z",
      "2026-06-29T15:30:00.000Z",
      "2026-06-29T16:30:00.000Z",
      "2026-06-29T17:00:00.000Z"
    ]);
    expect(startsAt).not.toContain("2026-06-29T16:00:00.000Z");
    expect(startsAt).not.toContain("2026-06-29T17:30:00.000Z");
    expect(startsAt).not.toContain("2026-06-29T18:00:00.000Z");
    expect(startsAt).not.toContain("2026-06-29T18:30:00.000Z");
    const lastFindManyInput = tx.appointment.findMany.mock.calls.at(-1)?.[0];
    expect(lastFindManyInput?.where?.id).toEqual({ not: "appointment-current" });

  });

  it("rejects a pending waitlist offer and emits a reassignment event", async () => {
    const offer = {
      appointmentId: "00000000-0000-0000-0000-000000000002",
      expiresAt: new Date(Date.now() + 60_000),
      id: "00000000-0000-0000-0000-000000000003",
      status: WaitlistOfferStatus.PENDING,
      waitlistEntryId: "00000000-0000-0000-0000-000000000004",
      appointment: {
        businessId: "00000000-0000-0000-0000-000000000001",
        cancellationToken: "cancel-token",
        customer: {
          completedAppointments: 0,
          email: "customer@example.test",
          id: "00000000-0000-0000-0000-000000000005",
          name: "Customer",
          noShowCount: 0,
          phone: null,
          requiresDeposit: false,
          riskLevel: "LOW",
          riskScore: 0,
          totalAppointments: 1
        },
        endsAt: new Date("2026-06-19T10:30:00.000Z"),
        id: "00000000-0000-0000-0000-000000000002",
        service: {
          durationMinutes: 30,
          id: "00000000-0000-0000-0000-000000000006",
          name: "Corte",
          priceCents: 120000
        },
        staffMember: {
          id: "00000000-0000-0000-0000-000000000007",
          name: "Lucas"
        },
        startsAt: new Date("2026-06-19T10:00:00.000Z"),
        status: AppointmentStatus.CANCELLED_BY_CUSTOMER
      }
    };
    const eventOutboxCreate = vi.fn<(input: EventOutboxCreateInput) => Promise<unknown>>().mockResolvedValue({});
    const waitlistOfferUpdateMany = vi
      .fn<(input: WaitlistOfferUpdateManyInput) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 });
    const waitlistEntryUpdateMany = vi
      .fn<(input: WaitlistEntryUpdateManyInput) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 });
    const prisma = {
      waitlistOffer: {
        findUnique: vi.fn().mockResolvedValue(offer)
      },
      $transaction: vi.fn((fn: (tx: TransactionMock) => Promise<unknown>) =>
        fn({
          eventOutbox: {
            create: eventOutboxCreate
          },
          waitlistEntry: {
            updateMany: waitlistEntryUpdateMany
          },
          waitlistOffer: {
            updateMany: waitlistOfferUpdateMany
          }
        })
      )
    };
    const service = new AppointmentsService(audit as never, {} as never, new OutboxService(), prisma as never);

    await expect(service.rejectWaitlistOffer("public-token")).resolves.toEqual({ status: "rejected" });

    const offerUpdate = waitlistOfferUpdateMany.mock.calls[0]?.[0];
    expect(offerUpdate?.data.status).toBe(WaitlistOfferStatus.REJECTED);
    expect(offerUpdate?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(offerUpdate?.where.id).toBe(offer.id);
    expect(offerUpdate?.where.status).toBe(WaitlistOfferStatus.PENDING);

    const entryUpdate = waitlistEntryUpdateMany.mock.calls[0]?.[0];
    expect(entryUpdate).toEqual({
      data: { status: WaitlistStatus.WAITING },
      where: {
        id: offer.waitlistEntryId,
        status: WaitlistStatus.OFFERED
      }
    });

    const outboxEvent = eventOutboxCreate.mock.calls[0]?.[0];
    expect(outboxEvent?.data.aggregateId).toBe(offer.appointmentId);
    expect(outboxEvent?.data.businessId).toBe(offer.appointment.businessId);
    expect(outboxEvent?.data.routingKey).toBe(EventRoutingKeys.WaitlistOfferRejected);
    expect(outboxEvent?.data.type).toBe(EventTypes.WaitlistOfferRejected);
    expect(outboxEvent?.data.version).toBe(1);
  });

  it("rebalances customer attendance counters when a no-show is corrected to completed", async () => {
    const business = { id: "business-1" };
    const appointment = {
      businessId: business.id,
      customer: {
        completedAppointments: 1,
        email: "customer@example.test",
        id: "customer-1",
        name: "Customer",
        noShowCount: 2,
        phone: null,
        requiresDeposit: false,
        riskLevel: "MEDIUM",
        riskScore: 38,
        totalAppointments: 4
      },
      customerId: "customer-1",
      endsAt: new Date("2026-06-19T10:30:00.000Z"),
      id: "appointment-1",
      service: {
        active: true,
        bufferMinutes: 0,
        businessId: business.id,
        createdAt: new Date("2026-06-18T10:00:00.000Z"),
        durationMinutes: 30,
        id: "service-1",
        name: "Corte",
        priceCents: 120000,
        updatedAt: new Date("2026-06-18T10:00:00.000Z")
      },
      staffMember: {
        active: true,
        businessId: business.id,
        createdAt: new Date("2026-06-18T10:00:00.000Z"),
        email: null,
        id: "staff-1",
        name: "Lucas",
        updatedAt: new Date("2026-06-18T10:00:00.000Z")
      },
      startsAt: new Date("2026-06-19T10:00:00.000Z"),
      status: AppointmentStatus.NO_SHOW,
      cancellationToken: "cancel-token"
    };
    const updatedAppointment = {
      ...appointment,
      customer: {
        ...appointment.customer,
        completedAppointments: 2,
        noShowCount: 1,
        requiresDeposit: false,
        riskLevel: "MEDIUM",
        riskScore: 32
      },
      status: AppointmentStatus.COMPLETED
    };
    const appointmentUpdate = vi.fn().mockResolvedValue(undefined);
    const appointmentFindUniqueOrThrow = vi.fn().mockResolvedValue(updatedAppointment);
    const customerUpdate = vi.fn().mockResolvedValue({});
    const appointmentEventCreate = vi.fn().mockResolvedValue({});
    const eventOutboxCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      appointment: {
        findFirst: vi.fn().mockResolvedValue(appointment)
      },
      $transaction: vi.fn(
        async (
          fn: (tx: {
            appointment: {
              update: typeof appointmentUpdate;
              findUniqueOrThrow: typeof appointmentFindUniqueOrThrow;
            };
            appointmentEvent: { create: typeof appointmentEventCreate };
            customer: { update: typeof customerUpdate };
            eventOutbox: { create: typeof eventOutboxCreate };
          }) => Promise<unknown>
        ) =>
          fn({
            appointment: {
              findUniqueOrThrow: appointmentFindUniqueOrThrow,
              update: appointmentUpdate
            },
            appointmentEvent: { create: appointmentEventCreate },
            customer: { update: customerUpdate },
            eventOutbox: { create: eventOutboxCreate }
          })
      )
    };
    const service = new AppointmentsService(
      audit as never,
      { requireCurrentBusiness: vi.fn().mockResolvedValue(business) } as never,
      new OutboxService(),
      prisma as never
    );

    const result = await service.updatePrivateAppointmentStatus({ id: "user-1" } as never, appointment.id, {
      status: "completed"
    });

    expect(customerUpdate).toHaveBeenCalledWith({
      data: {
        completedAppointments: 2,
        noShowCount: 1
      },
      where: { id: appointment.customerId }
    });
    expect(appointmentEventCreate).toHaveBeenCalledWith({
      data: {
        appointmentId: appointment.id,
        businessId: business.id,
        eventType: EventTypes.AppointmentCompleted,
        metadata: { status: "completed" }
      }
    });
    const outboxCreateInput = eventOutboxCreate.mock.calls[0]?.[0] as EventOutboxCreateInput | undefined;
    expect(outboxCreateInput?.data.aggregateId).toBe(appointment.id);
    expect(outboxCreateInput?.data.businessId).toBe(business.id);
    expect(outboxCreateInput?.data.routingKey).toBe(EventRoutingKeys.AppointmentCompleted);
    expect(outboxCreateInput?.data.type).toBe(EventTypes.AppointmentCompleted);
    expect(outboxCreateInput?.data.version).toBe(1);
    expect(result.customer).toMatchObject({
      completedAppointments: 2,
      noShowCount: 1,
      riskLevel: "medium",
      riskScore: 32,
      totalAppointments: 4
    });
    expect(result.status).toBe("completed");
  });
});
