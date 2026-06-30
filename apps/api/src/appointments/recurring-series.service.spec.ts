import { AppointmentStatus, RecurringSeriesStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { RecurringSeriesService } from "./recurring-series.service";

type OutboxCreateManyInput = {
  data: Array<{
    aggregateId: string;
    payload: {
      status: string;
    };
    routingKey: string;
    type: string;
  }>;
};

describe("RecurringSeriesService", () => {
  it("cancels future appointments and queues calendar cancellation events", async () => {
    const series = {
      businessId: "business-1",
      customerId: "customer-1",
      id: "series-1",
      status: RecurringSeriesStatus.ACTIVE
    };
    const appointment = {
      businessId: "business-1",
      cancellationToken: "cancel-token",
      customer: {
        completedAppointments: 0,
        email: "customer@example.test",
        id: "customer-1",
        name: "Customer",
        noShowCount: 0,
        phone: null,
        requiresDeposit: false,
        riskLevel: "LOW",
        riskScore: 0,
        totalAppointments: 2
      },
      endsAt: new Date("2026-07-02T15:30:00.000Z"),
      id: "appointment-1",
      service: {
        durationMinutes: 30,
        id: "service-1",
        name: "Corte",
        priceCents: 120000
      },
      staffMember: {
        id: "staff-1",
        name: "Lucas"
      },
      startsAt: new Date("2026-07-02T15:00:00.000Z"),
      status: AppointmentStatus.CONFIRMED
    };
    const appointmentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const appointmentEventCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const customerUpdate = vi.fn().mockResolvedValue({});
    const eventOutboxCreateMany = vi.fn<(input: OutboxCreateManyInput) => Promise<{ count: number }>>().mockResolvedValue({ count: 2 });
    const recurringUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      appointment: {
        findMany: vi.fn().mockResolvedValue([appointment])
      },
      business: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "America/Argentina/Buenos_Aires" })
      },
      recurringAppointmentSeries: {
        findFirst: vi.fn().mockResolvedValue(series),
        update: recurringUpdate
      },
      $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          appointment: { updateMany: appointmentUpdateMany },
          appointmentEvent: { createMany: appointmentEventCreateMany },
          customer: { update: customerUpdate },
          eventOutbox: { createMany: eventOutboxCreateMany },
          recurringAppointmentSeries: { update: recurringUpdate }
        })
      )
    };
    const appointmentValidator = {
      assertStaffMemberCanTakeSlot: vi.fn()
    };
    const service = new RecurringSeriesService(appointmentValidator as never, new OutboxService(), prisma as never);

    const result = await service.cancelSeries({ businessId: "business-1", email: "owner@example.test", id: "user-1" }, "series-1");

    expect(result).toEqual({ cancelledAppointments: 1, id: "series-1" });
    expect(appointmentUpdateMany).toHaveBeenCalledWith({
      data: { status: AppointmentStatus.CANCELLED_BY_BUSINESS },
      where: { id: { in: ["appointment-1"] } }
    });
    expect(customerUpdate).toHaveBeenCalledWith({
      data: { totalAppointments: { decrement: 1 } },
      where: { id: "customer-1" }
    });
    expect(eventOutboxCreateMany).toHaveBeenCalled();
    const outboxRows = eventOutboxCreateMany.mock.calls[0]![0].data;
    expect(outboxRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateId: "appointment-1",
          routingKey: EventRoutingKeys.AppointmentCancelled,
          type: EventTypes.AppointmentCancelled
        }),
        expect.objectContaining({
          aggregateId: "appointment-1",
          routingKey: EventRoutingKeys.SlotReleased,
          type: EventTypes.SlotReleased
        })
      ])
    );
    expect(outboxRows[0]!.payload.status).toBe("cancelled_by_business");
  });
});
