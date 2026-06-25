import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";

type AuditClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    client: AuditClient,
    input: {
      businessId: string;
      user: AuthenticatedUser | null;
      action: string;
      entity: string;
      entityId: string;
      before?: Prisma.InputJsonValue;
      after?: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
      requestId?: string | null;
    }
  ): Promise<unknown> {
    return client.auditLog.create({
      data: {
        action: input.action,
        after: input.after,
        before: input.before,
        businessId: input.businessId,
        entity: input.entity,
        entityId: input.entityId,
        metadata: input.metadata,
        requestId: input.requestId ?? null,
        userId: input.user?.id ?? null
      }
    });
  }

  async listForCurrentUser(user: AuthenticatedUser) {
    const business = await this.prisma.business.findFirst({
      select: { id: true },
      where: {
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                active: true,
                userId: user.id
              }
            }
          }
        ]
      }
    });

    if (!business) {
      return [];
    }

    return this.prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { businessId: business.id }
    });
  }
}
