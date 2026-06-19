import { AppointmentStatus, WaitlistOfferStatus, WaitlistStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

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

describe("AppointmentsService", () => {
  it("rejects a pending waitlist offer and emits a reassignment event", async () => {
    const offer = {
      appointmentId: "00000000-0000-0000-0000-000000000002",
      expiresAt: new Date("2026-06-19T12:00:00.000Z"),
      id: "00000000-0000-0000-0000-000000000003",
      status: WaitlistOfferStatus.PENDING,
      waitlistEntryId: "00000000-0000-0000-0000-000000000004",
      appointment: {
        businessId: "00000000-0000-0000-0000-000000000001",
        cancellationToken: "cancel-token",
        customer: {
          email: "customer@example.test",
          id: "00000000-0000-0000-0000-000000000005",
          name: "Customer",
          noShowCount: 0,
          phone: null
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
    const service = new AppointmentsService({} as never, new OutboxService(), prisma as never);

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
});
