import { Injectable, type NestMiddleware } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient, type RedisClientType } from "redis";

type RequestLike = Parameters<RateLimitRequestHandler>[0];
type ResponseLike = Parameters<RateLimitRequestHandler>[1];
type NextLike = Parameters<RateLimitRequestHandler>[2];
type KeyGenerator = (req: RequestLike, res: ResponseLike) => string;

let redisClientPromise: Promise<RedisClientType> | null = null;

function shouldUseRedis(config: ConfigService): boolean {
  const explicit = config.get<string>("RATE_LIMIT_USE_REDIS");
  if (explicit) {
    return explicit.toLowerCase() !== "false";
  }

  return config.get<string>("NODE_ENV", "development") !== "test";
}

function getRedisClient(config: ConfigService): Promise<RedisClientType> {
  if (!redisClientPromise) {
    const client = createClient({
      url: config.get<string>("REDIS_URL", "redis://localhost:6379")
    });

    redisClientPromise = client.connect().then(() => client);
  }

  return redisClientPromise;
}

function createRedisStore(config: ConfigService): RedisStore {
  return new RedisStore({
    prefix: "turnoflow:rate-limit:",
    sendCommand: async (...args: string[]) => {
      const client = await getRedisClient(config);
      return client.sendCommand(args);
    }
  });
}

function createLimiter(
  config: ConfigService,
  input: { keyGenerator?: KeyGenerator; max: number; message: string; windowMs: number }
): RateLimitRequestHandler {
  return rateLimit({
    keyGenerator: input.keyGenerator,
    legacyHeaders: false,
    max: input.max,
    message: { message: input.message },
    standardHeaders: true,
    store: shouldUseRedis(config) ? createRedisStore(config) : undefined,
    windowMs: input.windowMs
  });
}

function readStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const arrayValue = value as unknown[];
    const firstString = arrayValue.find((entry) => typeof entry === "string" && entry.length > 0);
    return typeof firstString === "string" ? firstString : null;
  }

  return null;
}

function readAppointmentToken(req: RequestLike): string | null {
  const tokenFromQuery = readStringValue(req.query?.token);

  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  if (typeof req.body === "object" && req.body !== null && "token" in req.body) {
    const body = req.body as Record<string, unknown>;
    return readStringValue(body.token);
  }

  return null;
}

function readAppointmentId(req: RequestLike): string | null {
  return readStringValue(req.params?.id);
}

export function buildAppointmentRateLimitKey(req: RequestLike): string {
  const appointmentId = readAppointmentId(req);
  const appointmentToken = readAppointmentToken(req);

  if (appointmentId && appointmentToken) {
    return `appointment:${appointmentId}:${appointmentToken}`;
  }

  if (appointmentId) {
    return `appointment:${appointmentId}:${req.ip ?? "anonymous"}`;
  }

  return req.ip ?? "anonymous";
}

@Injectable()
export class PublicWriteRateLimitMiddleware implements NestMiddleware {
  private readonly limiter: RateLimitRequestHandler;

  constructor(config: ConfigService) {
    this.limiter = createLimiter(config, {
      max: 20,
      message: "Demasiadas solicitudes, intenta mas tarde",
      windowMs: 15 * 60 * 1000
    });
  }

  use(req: RequestLike, res: ResponseLike, next: NextLike): void {
    void this.limiter(req, res, next);
  }
}

@Injectable()
export class PublicReadRateLimitMiddleware implements NestMiddleware {
  private readonly limiter: RateLimitRequestHandler;

  constructor(config: ConfigService) {
    this.limiter = createLimiter(config, {
      max: 60,
      message: "Demasiadas solicitudes, intenta mas tarde",
      windowMs: 60 * 1000
    });
  }

  use(req: RequestLike, res: ResponseLike, next: NextLike): void {
    void this.limiter(req, res, next);
  }
}

@Injectable()
export class PublicAppointmentWriteRateLimitMiddleware implements NestMiddleware {
  private readonly limiter: RateLimitRequestHandler;

  constructor(config: ConfigService) {
    this.limiter = createLimiter(config, {
      keyGenerator: buildAppointmentRateLimitKey,
      max: 20,
      message: "Demasiadas solicitudes, intenta mas tarde",
      windowMs: 15 * 60 * 1000
    });
  }

  use(req: RequestLike, res: ResponseLike, next: NextLike): void {
    void this.limiter(req, res, next);
  }
}

@Injectable()
export class PublicAppointmentReadRateLimitMiddleware implements NestMiddleware {
  private readonly limiter: RateLimitRequestHandler;

  constructor(config: ConfigService) {
    this.limiter = createLimiter(config, {
      keyGenerator: buildAppointmentRateLimitKey,
      max: 60,
      message: "Demasiadas solicitudes, intenta mas tarde",
      windowMs: 60 * 1000
    });
  }

  use(req: RequestLike, res: ResponseLike, next: NextLike): void {
    void this.limiter(req, res, next);
  }
}
