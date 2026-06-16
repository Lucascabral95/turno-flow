import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventOutboxStatus } from "@prisma/client";
import { connect, type ChannelModel } from "amqplib";

import { PrismaService } from "../prisma/prisma.service";

const EXCHANGE_NAME = "turnoflow.events";
const PUBLISH_INTERVAL_MS = 5_000;

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
      where: { status: { in: [EventOutboxStatus.PENDING, EventOutboxStatus.FAILED] } }
    });

    if (events.length === 0) {
      return;
    }

    try {
      const channel = await this.createChannel();

      for (const event of events) {
        const message = {
          aggregateId: event.aggregateId,
          businessId: event.businessId,
          eventId: event.id,
          occurredAt: event.createdAt.toISOString(),
          payload: event.payload,
          type: event.type,
          version: event.version
        };

        channel.publish(EXCHANGE_NAME, event.type, Buffer.from(JSON.stringify(message)), {
          contentType: "application/json",
          messageId: event.id,
          persistent: true,
          type: event.type
        });

        await this.prisma.eventOutbox.update({
          data: {
            lastError: null,
            publishedAt: new Date(),
            status: EventOutboxStatus.PUBLISHED
          },
          where: { id: event.id }
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown RabbitMQ publish error";
      this.logger.warn(`Outbox publish failed: ${message}`);

      await Promise.all(
        events.map((event) =>
          this.prisma.eventOutbox.update({
            data: {
              attempts: { increment: 1 },
              lastError: message,
              status: EventOutboxStatus.FAILED
            },
            where: { id: event.id }
          })
        )
      );
    }
  }

  private async createChannel() {
    const connection = await this.getConnection();
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    return channel;
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
