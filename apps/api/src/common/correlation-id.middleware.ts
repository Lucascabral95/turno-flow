import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { correlationIdStorage } from "./correlation-id";

type CorrelationRequest = {
  headers: Record<string, string | string[] | undefined>;
};

type CorrelationResponse = {
  setHeader: (name: string, value: string) => void;
};

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: CorrelationRequest, res: CorrelationResponse, next: () => void): void {
    const header = req.headers["x-correlation-id"];
    const id = typeof header === "string" ? header : randomUUID();
    res.setHeader("x-correlation-id", id);
    correlationIdStorage.run(id, () => next());
  }
}
