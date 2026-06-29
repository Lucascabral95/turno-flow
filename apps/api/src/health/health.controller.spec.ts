import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("live returns ok status", () => {
    const controller = new HealthController({} as never, { isConnected: () => true } as never);
    expect(controller.live()).toEqual({ status: "ok" });
  });

  it("ready returns ok when all checks pass", async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const publisher = { isConnected: () => true };
    const controller = new HealthController(prisma as never, publisher as never);

    const result = await controller.ready();

    expect(result.status).toBe("ok");
    expect(result.checks.db.status).toBe("up");
    expect(result.checks.rabbitmq.status).toBe("up");
  });

  it("ready throws 503 when db is down", async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error("connection refused")) };
    const publisher = { isConnected: () => true };
    const controller = new HealthController(prisma as never, publisher as never);

    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });

  it("ready throws 503 when rabbitmq is not connected", async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };
    const publisher = { isConnected: () => false };
    const controller = new HealthController(prisma as never, publisher as never);

    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});
