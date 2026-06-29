import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { EventPublisherService } from "../events/event-publisher.service";
import { PrismaService } from "../prisma/prisma.service";

type CheckResult = { error?: string; status: "down" | "up" };
type ReadinessResponse = {
  checks: { db: CheckResult; rabbitmq: CheckResult };
  status: "degraded" | "ok";
};

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: EventPublisherService
  ) {}

  @Get()
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(): Promise<ReadinessResponse> {
    const [db, rabbitmq] = await Promise.all([this.checkDb(), this.checkRabbitMq()]);
    const result: ReadinessResponse = {
      checks: { db, rabbitmq },
      status: db.status === "up" && rabbitmq.status === "up" ? "ok" : "degraded"
    };

    if (result.status === "degraded") {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }

  private async checkDb(): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "up" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "unknown", status: "down" };
    }
  }

  private checkRabbitMq(): Promise<CheckResult> {
    return Promise.resolve(
      this.publisher.isConnected()
        ? { status: "up" }
        : { error: "not connected", status: "down" }
    );
  }
}
