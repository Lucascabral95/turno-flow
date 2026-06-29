import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { getCorrelationId } from "../common/correlation-id";
import type { EventRoutingKey, EventType } from "./event-types";

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class OutboxService {
  async create(
    tx: TransactionClient,
    input: {
      type: EventType;
      version: number;
      businessId: string;
      aggregateId: string;
      routingKey: EventRoutingKey;
      payload: Prisma.InputJsonValue;
    }
  ): Promise<void> {
    await tx.eventOutbox.create({
      data: {
        aggregateId: input.aggregateId,
        businessId: input.businessId,
        correlationId: getCorrelationId(),
        payload: input.payload,
        routingKey: input.routingKey,
        type: input.type,
        version: input.version
      }
    });
  }
}
