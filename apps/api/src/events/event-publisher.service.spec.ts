import { EventOutboxStatus, type EventOutbox } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventPublisherService } from "./event-publisher.service";

type PublishedEventUpdateInput = {
  data: {
    lastError: null;
    publishedAt: Date;
    status: EventOutboxStatus;
  };
  where: {
    id: string;
  };
};

const rabbit = vi.hoisted(() => {
  const publishCallbacks: Array<(error: Error | null) => void> = [];
  const channel = {
    assertExchange: vi.fn().mockResolvedValue({}),
    assertQueue: vi.fn().mockResolvedValue({}),
    bindQueue: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn((_exchange, _routingKey, _content, _options, callback: (error: Error | null) => void) => {
      publishCallbacks.push(callback);
      return true;
    })
  };
  const connection = {
    close: vi.fn().mockResolvedValue(undefined),
    createConfirmChannel: vi.fn().mockResolvedValue(channel),
    on: vi.fn()
  };

  return {
    channel,
    connect: vi.fn().mockResolvedValue(connection),
    connection,
    publishCallbacks
  };
});

vi.mock("amqplib", () => ({
  connect: rabbit.connect
}));

describe("EventPublisherService", () => {
  beforeEach(() => {
    rabbit.channel.assertExchange.mockClear();
    rabbit.channel.assertQueue.mockClear();
    rabbit.channel.bindQueue.mockClear();
    rabbit.channel.close.mockClear();
    rabbit.channel.publish.mockClear();
    rabbit.connection.createConfirmChannel.mockClear();
    rabbit.connection.on.mockClear();
    rabbit.connect.mockClear();
    rabbit.publishCallbacks.length = 0;
  });

  it("marks an outbox event as published only after RabbitMQ confirms it", async () => {
    const event = makeEvent();
    const update = vi.fn<(input: PublishedEventUpdateInput) => Promise<unknown>>().mockResolvedValue({});
    const prisma = {
      eventOutbox: {
        findMany: vi.fn().mockResolvedValue([event]),
        update
      }
    };
    const config = {
      get: vi.fn().mockReturnValue("amqp://rabbitmq.test/")
    };
    const service = new EventPublisherService(config as never, prisma as never);

    const publishPromise = service.publishPending();
    await waitForPublish();

    expect(rabbit.channel.publish).toHaveBeenCalledWith(
      "turnoflow.events",
      "appointment.booked",
      expect.any(Buffer),
      expect.objectContaining({
        messageId: event.id,
        persistent: true,
        type: "AppointmentBooked"
      }),
      expect.any(Function)
    );
    expect(update).not.toHaveBeenCalled();

    rabbit.publishCallbacks[0]?.(null);
    await publishPromise;

    expect(update).toHaveBeenCalledTimes(1);
    const updateInput = update.mock.calls[0]?.[0];
    expect(updateInput?.data.publishedAt).toBeInstanceOf(Date);
    expect(updateInput).toEqual({
      data: {
        lastError: null,
        publishedAt: updateInput?.data.publishedAt,
        status: EventOutboxStatus.PUBLISHED
      },
      where: { id: event.id }
    });
  });

  it("declares durable worker queues with the initial routing keys", async () => {
    const prisma = {
      eventOutbox: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn()
      }
    };
    const config = {
      get: vi.fn().mockReturnValue("amqp://rabbitmq.test/")
    };
    const service = new EventPublisherService(config as never, prisma as never);

    await service.publishPending();

    expect(rabbit.channel.assertExchange).not.toHaveBeenCalled();

    prisma.eventOutbox.findMany.mockResolvedValue([makeEvent()]);
    const publishPromise = service.publishPending();
    await waitForPublish();
    rabbit.publishCallbacks[0]?.(null);
    await publishPromise;

    expect(rabbit.channel.assertExchange).toHaveBeenCalledWith("turnoflow.events", "topic", { durable: true });
    expect(rabbit.channel.assertQueue).toHaveBeenCalledWith("worker.appointments", { durable: true });
    expect(rabbit.channel.assertQueue).toHaveBeenCalledWith("worker.waitlist", { durable: true });
    expect(rabbit.channel.assertQueue).toHaveBeenCalledWith("worker.notifications", { durable: true });
    expect(rabbit.channel.assertQueue).toHaveBeenCalledWith("worker.metrics", { durable: true });
    expect(rabbit.channel.bindQueue).toHaveBeenCalledWith("worker.appointments", "turnoflow.events", "appointment.booked");
    expect(rabbit.channel.bindQueue).toHaveBeenCalledWith("worker.waitlist", "turnoflow.events", "waitlist.entry_created");
    expect(rabbit.channel.bindQueue).toHaveBeenCalledWith("worker.notifications", "turnoflow.events", "reminder.scheduled");
    expect(rabbit.channel.bindQueue).toHaveBeenCalledWith("worker.notifications", "turnoflow.events", "waitlist.offer_created");
    expect(rabbit.channel.bindQueue).toHaveBeenCalledWith("worker.metrics", "turnoflow.events", "metrics.recalculate");
  });
});

function makeEvent(): EventOutbox {
  return {
    aggregateId: "00000000-0000-0000-0000-000000000002",
    attempts: 0,
    businessId: "00000000-0000-0000-0000-000000000001",
    createdAt: new Date("2026-06-18T12:00:00.000Z"),
    id: "00000000-0000-0000-0000-000000000003",
    lastError: null,
    payload: { appointmentId: "00000000-0000-0000-0000-000000000002" },
    publishedAt: null,
    routingKey: "appointment.booked",
    status: EventOutboxStatus.PENDING,
    type: "AppointmentBooked",
    updatedAt: new Date("2026-06-18T12:00:00.000Z"),
    version: 1
  };
}

async function waitForPublish(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (rabbit.channel.publish.mock.calls.length > 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error("Timed out waiting for RabbitMQ publish");
}
