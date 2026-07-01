import { PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Server } from "node:http";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { AppModule } from "../src/app.module";
import { startIntegrationEnv, type IntegrationEnv } from "./setup-integration";

const WORKER_DIR = join(process.cwd(), "..", "worker");
const REPO_ROOT = join(process.cwd(), "..", "..");
const WORKER_BINARY = join(WORKER_DIR, ".cache", process.platform === "win32" ? "turnoflow-worker-integration.exe" : "turnoflow-worker-integration");

describe("Worker journey integration (API -> RabbitMQ -> Go worker -> Postgres)", () => {
  let env: IntegrationEnv;
  let app: INestApplication;
  let prisma: PrismaClient;
  let workerProcess: ChildProcess;
  let workerExited: Promise<void>;

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

    buildWorkerBinary();
    workerProcess = spawn(WORKER_BINARY, [], {
      env: {
        ...process.env,
        APP_BASE_URL: "http://localhost:3000",
        DATABASE_URL: env.databaseUrl,
        EMAIL_TRANSPORT: "json",
        RABBITMQ_URL: env.rabbitmqUrl,
        WORKER_MODE: "all"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    workerExited = new Promise((resolve) => {
      workerProcess.once("exit", () => resolve());
    });

    await waitForWorkerReady(workerProcess);
  }, 180000);

  afterAll(async () => {
    if (workerProcess) {
      workerProcess.kill();
      await workerExited;
    }
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (env) await env.cleanup();
  }, 120000);

  it("processes a completed appointment end-to-end: requests a review and updates customer risk", async () => {
    const server = app.getHttpServer() as Server;

    const registerRes = await request(server)
      .post("/auth/register")
      .send({
        email: "worker-journey-owner@turnoflow.local",
        name: "Journey Owner",
        password: "testpassword123"
      });

    expect(registerRes.status).toBe(201);
    const { accessToken } = registerRes.body as { accessToken: string };

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "worker-journey-owner@turnoflow.local" }
    });

    const business = await prisma.business.create({
      data: {
        name: "Worker Journey Business",
        ownerId: owner.id,
        slug: "worker-journey-business",
        timezone: "America/Argentina/Buenos_Aires"
      }
    });

    await prisma.businessMember.create({
      data: {
        active: true,
        businessId: business.id,
        role: "OWNER",
        userId: owner.id
      }
    });

    const service = await prisma.service.create({
      data: {
        businessId: business.id,
        durationMinutes: 30,
        name: "Corte",
        priceCents: 5000
      }
    });

    const staffMember = await prisma.staffMember.create({
      data: {
        businessId: business.id,
        name: "Staff Uno"
      }
    });

    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        email: "worker-journey-customer@turnoflow.local",
        name: "Journey Customer"
      }
    });

    const appointment = await prisma.appointment.create({
      data: {
        businessId: business.id,
        cancellationToken: "worker-journey-cancel-token",
        customerId: customer.id,
        endsAt: new Date(Date.now() - 30 * 60 * 1000),
        serviceId: service.id,
        staffMemberId: staffMember.id,
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        status: "CONFIRMED"
      }
    });

    const completeRes = await request(server)
      .patch(`/appointments/${appointment.id}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send();

    expect(completeRes.status).toBe(200);

    await vi.waitFor(
      async () => {
        const review = await prisma.appointmentReview.findUnique({
          where: { appointmentId: appointment.id }
        });
        expect(review).not.toBeNull();
        expect(review?.customerId).toBe(customer.id);
        expect(review?.submittedAt).toBeNull();

        const updatedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
        expect(updatedCustomer.lastRiskCalculatedAt).not.toBeNull();
        expect(updatedCustomer.completedAppointments).toBeGreaterThanOrEqual(1);
      },
      { timeout: 60000, interval: 1000 }
    );
  }, 120000);
});

function buildWorkerBinary(): void {
  mkdirSync(join(WORKER_DIR, ".cache"), { recursive: true });

  execFileSync("go", ["build", "-o", WORKER_BINARY, "./cmd/worker"], {
    cwd: WORKER_DIR,
    env: {
      ...process.env,
      GOCACHE: join(REPO_ROOT, ".cache", "go-build-codex"),
      GOMODCACHE: join(REPO_ROOT, ".cache", "go-mod-codex")
    },
    stdio: "pipe"
  });
}

function waitForWorkerReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(`[worker] ${chunk.toString()}`);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[worker] ${chunk.toString()}`);
    });

    const readyTimeout = setTimeout(() => resolve(), 5000);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("worker starting")) {
        clearTimeout(readyTimeout);
        resolve();
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(readyTimeout);
      reject(new Error(`worker process exited early with code ${code}`));
    });
  });
}
