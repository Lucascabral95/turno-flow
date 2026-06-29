import { PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect } from "amqplib";

import { AppModule } from "../src/app.module";
import { startIntegrationEnv, type IntegrationEnv } from "./setup-integration";

describe("Outbox integration (Postgres + RabbitMQ)", () => {
  let env: IntegrationEnv;
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    env = await startIntegrationEnv();

    prisma = new PrismaClient({
      datasources: { db: { url: env.databaseUrl } }
    });
    await prisma.$connect();

    process.env.DATABASE_URL = env.databaseUrl;
    process.env.RABBITMQ_URL = env.rabbitmqUrl;
    process.env.JWT_SECRET = "test-secret";

    app = await NestFactory.create(AppModule, { logger: ["error"] });
    await app.init();
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (env) await env.cleanup();
  }, 120000);

  it("publishes an outbox event to RabbitMQ after creating an appointment", async () => {
    const conn = await connect(env.rabbitmqUrl);
    const channel = await conn.createChannel();
    await channel.assertExchange("turnoflow.events", "topic", { durable: true });
    await channel.assertQueue("test-consumer", { durable: false });
    await channel.bindQueue("test-consumer", "turnoflow.events", "appointment.booked");

    const messagePromise = new Promise<{ content: Buffer } | null>((resolve) => {
      void channel.consume(
        "test-consumer",
        (msg) => {
          if (msg) {
            resolve(msg);
          }
        },
        { noAck: true }
      );
      setTimeout(() => resolve(null), 30000);
    });

    const user = await prisma.user.create({
      data: {
        email: "integration-test@turnoflow.local",
        name: "Test User",
        passwordHash: "fake-hash"
      }
    });

    const business = await prisma.business.create({
      data: {
        name: "Integration Test Business",
        ownerId: user.id,
        slug: "integration-test-business",
        timezone: "America/Argentina/Buenos_Aires"
      }
    });

    const service = await prisma.service.create({
      data: {
        businessId: business.id,
        durationMinutes: 30,
        name: "Integration Test Service",
        priceCents: 5000
      }
    });

    const staffMember = await prisma.staffMember.create({
      data: {
        businessId: business.id,
        name: "Test Staff"
      }
    });

    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        email: "customer-integration@turnoflow.local",
        name: "Test Customer"
      }
    });

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        cancellationToken: "test-cancel-token",
        customerId: customer.id,
        endsAt: new Date(Date.now() + 90 * 60 * 1000),
        serviceId: service.id,
        staffMemberId: staffMember.id,
        startsAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    await prisma.eventOutbox.create({
      data: {
        aggregateId: appointment.id,
        businessId: business.id,
        correlationId: "test-correlation-id",
        payload: { appointmentId: appointment.id },
        routingKey: "appointment.booked",
        type: "AppointmentBooked",
        version: 1
      }
    });

    await vi.waitFor(
      async () => {
        const published = await prisma.eventOutbox.findFirst({
          where: { type: "AppointmentBooked" }
        });
        expect(published?.status).toBe("PUBLISHED");
      },
      { timeout: 30000, interval: 1000 }
    );

    const message = await messagePromise;

    await channel.close();
    await conn.close();

    expect(message).not.toBeNull();
    const body = JSON.parse(message!.content.toString()) as {
      correlationId: string;
      eventId: string;
      type: string;
    };
    expect(body.type).toBe("AppointmentBooked");
    expect(body.correlationId).toBe("test-correlation-id");
    expect(body.eventId).toBeDefined();
  }, 120000);
});
