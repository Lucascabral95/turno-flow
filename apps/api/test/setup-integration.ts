import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { execSync } from "node:child_process";
import { join } from "node:path";

export type IntegrationEnv = {
  cleanup: () => Promise<void>;
  databaseUrl: string;
  rabbitmqUrl: string;
};

export async function startIntegrationEnv(): Promise<IntegrationEnv> {
  const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("turnoflow")
    .withUsername("turnoflow")
    .withPassword("turnoflow")
    .start();

  const rabbitmq: StartedRabbitMQContainer = await new RabbitMQContainer(
    "rabbitmq:3.13-management-alpine"
  ).start();

  const databaseUrl = postgres.getConnectionUri();
  const rabbitmqUrl = rabbitmq.getAmqpUrl();

  const prismaDir = join(process.cwd(), "prisma");
  execSync(`npx prisma migrate deploy`, {
    cwd: prismaDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe"
  });

  return {
    cleanup: async () => {
      await Promise.all([postgres.stop(), rabbitmq.stop()]);
    },
    databaseUrl,
    rabbitmqUrl
  };
}
