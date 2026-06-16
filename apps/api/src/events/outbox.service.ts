import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { EventType } from "./event-types";

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
      payload: Prisma.InputJsonValue;
    }
  ): Promise<void> {
    await tx.eventOutbox.create({
      data: {
        aggregateId: input.aggregateId,
        businessId: input.businessId,
        payload: input.payload,
        type: input.type,
        version: input.version
      }
    });
  }
}
