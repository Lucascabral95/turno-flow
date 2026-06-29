import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import * as Sentry from "@sentry/nestjs";

import { AppModule } from "./app.module";
import { initSentry } from "./common/sentry.config";
import { SentryFilter } from "./common/sentry.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set("trust proxy", 1);
  const config = app.get(ConfigService);
  const port = config.get<number>("API_PORT", 3001);
  const nodeEnv = config.get<string>("NODE_ENV", "development");
  const isDev = nodeEnv !== "production";

  initSentry(config.get<string>("SENTRY_DSN"));

  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : undefined
    })
  );

  const appBaseUrl = config.get<string>("APP_BASE_URL", "http://localhost:3000");
  const webPort = config.get<string>("WEB_PORT", "3000");
  app.enableCors({
    credentials: true,
    origin: [appBaseUrl, `http://localhost:${webPort}`]
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true
    })
  );
  app.useGlobalFilters(new SentryFilter());

  Sentry.setupExpressErrorHandler(app);

  if (isDev) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("TurnoFlow API")
      .setDescription("Multi-tenant scheduling platform API")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
