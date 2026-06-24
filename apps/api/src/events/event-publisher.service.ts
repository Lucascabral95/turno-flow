import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventOutboxStatus, type EventOutbox } from "@prisma/client";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";

import { PrismaService } from "../prisma/prisma.service";

const EXCHANGE_NAME = "turnoflow.events";
const DEAD_LETTER_EXCHANGE = "turnoflow.events.dlx";
const APPOINTMENTS_DEAD_LETTER_ROUTING_KEY = "worker.appointments.dead";
const MAX_ATTEMPTS = 5;
const PUBLISH_INTERVAL_MS = 5_000;
const QUEUE_BINDINGS = [
  {
    name: "worker.appointments",
    options: {
      arguments: {
        "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
        "x-dead-letter-routing-key": APPOINTMENTS_DEAD_LETTER_ROUTING_KEY
      },
      durable: true
    },
    routingKeys: [
      "appointment.booked",
      "appointment.confirmed",
      "appointment.cancelled",
      "appointment.completed",
      "appointment.no_show",
      "appointment.marked_no_show",
      "slot.released",
      "slot.reassigned",
      "waitlist.offer_expired",
      "waitlist.offer_rejected"
    ]
  },
  {
    name: "worker.waitlist",
    options: {
      durable: true
    },
    routingKeys: [
      "appointment.cancelled",
      "slot.released",
      "slot.reassigned",
      "waitlist.candidate_matched",
      "waitlist.entry_created",
      "waitlist.offer_expired",
      "waitlist.offer_rejected"
    ]
  },
  {
    name: "worker.notifications",
    options: {
      durable: true
    },
    routingKeys: [
      "appointment.booked",
      "appointment.cancelled",
      "appointment.reminder_due",
      "notification.reminder_due",
      "reminder.failed",
      "reminder.scheduled",
      "reminder.sent",
      "waitlist.offer_created"
    ]
  },
  {
    name: "worker.metrics",
    options: {
      durable: true
    },
    routingKeys: [
      "appointment.booked",
      "appointment.cancelled",
      "appointment.completed",
      "appointment.no_show",
      "appointment.marked_no_show",
      "customer.risk_score_updated",
      "metrics.daily_calculated",
      "metrics.recalculate",
      "waitlist.offer_created",
      "waitlist.offer_accepted",
      "waitlist.offer_expired",
      "waitlist.offer_rejected"
    ]
  }
] as const;

@Injectable()
export class EventPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private connection: ChannelModel | undefined;
  private interval: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit(): Promise<void> {
    this.interval = setInterval(() => {
      void this.publishPending();
    }, PUBLISH_INTERVAL_MS);

    await this.publishPending();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }

    if (this.connection) {
      await this.connection.close();
    }
  }

  async publishPending(): Promise<void> {
    const events = await this.prisma.eventOutbox.findMany({
      orderBy: { createdAt: "asc" },
      take: 25,
      where: {
        attempts: { lt: MAX_ATTEMPTS },
        status: { in: [EventOutboxStatus.PENDING, EventOutboxStatus.FAILED] }
      }
    });

    if (events.length === 0) {
      return;
    }

    let channel: ConfirmChannel | undefined;

    try {
      channel = await this.createChannel();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown RabbitMQ connection error";
      this.logger.warn(`Outbox channel setup failed: ${message}`);
      await Promise.all(events.map((event) => this.markFailed(event, message)));
      return;
    }

    try {
      for (const event of events) {
        try {
          await this.publishEvent(channel, event);
          await this.prisma.eventOutbox.update({
            data: {
              lastError: null,
              publishedAt: new Date(),
              status: EventOutboxStatus.PUBLISHED
            },
            where: { id: event.id }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown RabbitMQ publish error";
          this.logger.warn(`Outbox publish failed event_id=${event.id}: ${message}`);
          await this.markFailed(event, message);
        }
      }
    } finally {
      await channel.close().catch((error: Error) => {
        this.logger.warn(`RabbitMQ channel close failed: ${error.message}`);
      });
    }
  }

  private async createChannel(): Promise<ConfirmChannel> {
    const connection = await this.getConnection();
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, "direct", { durable: true });
    await this.assertQueues(channel);
    return channel;
  }

  private async assertQueues(channel: ConfirmChannel): Promise<void> {
    await channel.assertQueue("worker.appointments.dlq", { durable: true });
    await channel.bindQueue("worker.appointments.dlq", DEAD_LETTER_EXCHANGE, APPOINTMENTS_DEAD_LETTER_ROUTING_KEY);

    for (const queue of QUEUE_BINDINGS) {
      await channel.assertQueue(queue.name, queue.options);
      for (const routingKey of queue.routingKeys) {
        await channel.bindQueue(queue.name, EXCHANGE_NAME, routingKey);
      }
    }
  }

  private publishEvent(channel: ConfirmChannel, event: EventOutbox): Promise<void> {
    const message = {
      aggregateId: event.aggregateId,
      businessId: event.businessId,
      eventId: event.id,
      occurredAt: event.createdAt.toISOString(),
      payload: event.payload,
      routingKey: event.routingKey,
      type: event.type,
      version: event.version
    };

    return new Promise((resolve, reject) => {
      channel.publish(
        EXCHANGE_NAME,
        event.routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          contentType: "application/json",
          messageId: event.id,
          persistent: true,
          type: event.type
        },
        (error) => {
          if (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          resolve();
        }
      );
    });
  }

  private async markFailed(event: EventOutbox, message: string): Promise<void> {
    await this.prisma.eventOutbox.update({
      data: {
        attempts: { increment: 1 },
        lastError: message,
        status: EventOutboxStatus.FAILED
      },
      where: { id: event.id }
    });
  }

  private async getConnection(): Promise<ChannelModel> {
    if (this.connection) {
      return this.connection;
    }

    this.connection = await connect(this.config.get<string>("RABBITMQ_URL", "amqp://localhost:5672/"));
    this.connection.on("error", (error: Error) => {
      this.logger.warn(`RabbitMQ connection error: ${error.message}`);
      this.connection = undefined;
    });
    this.connection.on("close", () => {
      this.connection = undefined;
    });

    return this.connection;
  }
}
