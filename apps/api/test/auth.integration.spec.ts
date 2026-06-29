import { PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Server } from "node:http";

import { AppModule } from "../src/app.module";
import { startIntegrationEnv, type IntegrationEnv } from "./setup-integration";

describe("Auth refresh token rotation integration (Postgres)", () => {
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

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const server = app.getHttpServer() as Server;

    const registerRes = await request(server)
      .post("/auth/register")
      .send({
        email: "auth-integration@turnoflow.local",
        name: "Auth Test",
        password: "testpassword123"
      });

    expect(registerRes.status).toBe(201);
    const { refreshToken: firstRefreshToken } = registerRes.body as { refreshToken: string };

    const refreshRes = await request(server)
      .post("/auth/refresh")
      .send({ refreshToken: firstRefreshToken });

    expect(refreshRes.status).toBe(201);
    const { refreshToken: secondRefreshToken } = refreshRes.body as { refreshToken: string };
    expect(secondRefreshToken).not.toBe(firstRefreshToken);

    const reuseRes = await request(server)
      .post("/auth/refresh")
      .send({ refreshToken: firstRefreshToken });

    expect(reuseRes.status).toBe(401);

    const revokedRes = await request(server)
      .post("/auth/refresh")
      .send({ refreshToken: secondRefreshToken });

    expect(revokedRes.status).toBe(401);

    const tokens = await prisma.refreshToken.findMany({
      orderBy: { createdAt: "asc" },
      where: { user: { email: "auth-integration@turnoflow.local" } }
    });

    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
  }, 120000);
});
