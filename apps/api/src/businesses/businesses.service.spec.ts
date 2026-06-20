import { ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessesService } from "./businesses.service";

describe("BusinessesService", () => {
  const outbox = {
    create: vi.fn()
  };

  const prisma = {
    $transaction: vi.fn(async <T>(callback: (tx: typeof prisma) => Promise<T>) => callback(prisma)),
    availabilityException: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn()
    },
    availabilityRule: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    business: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    service: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    staffMember: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    }
  };

  const user = { email: "owner@turnoflow.local", id: "user-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.business.findFirst.mockResolvedValue({
      id: "business-1",
      ownerId: user.id
    });
    prisma.staffMember.findFirst.mockResolvedValue({
      businessId: "business-1",
      id: "staff-1"
    });
    prisma.availabilityRule.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      active: true,
      businessId: "business-1",
      endTime: data.endTime,
      id: "rule-created",
      staffMemberId: data.staffMemberId,
      startTime: data.startTime,
      weekday: data.weekday
    }));
    prisma.availabilityRule.update.mockImplementation(async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => ({
      active: data.active ?? true,
      businessId: "business-1",
      endTime: data.endTime ?? "18:00",
      id: where.id,
      staffMemberId: "staff-1",
      startTime: data.startTime ?? "09:00",
      weekday: data.weekday ?? 1
    }));
    outbox.create.mockResolvedValue({});
  });

  it("rejects creating a second active weekly rule for the same professional and weekday", async () => {
    prisma.availabilityRule.findFirst.mockResolvedValueOnce({
      id: "rule-existing"
    });
    const service = new BusinessesService(outbox as never, prisma as never);

    await expect(
      service.createAvailabilityRule(user as never, {
        endTime: "18:00",
        staffMemberId: "staff-1",
        startTime: "09:00",
        weekday: 1
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.availabilityRule.create).not.toHaveBeenCalled();
  });

  it("rejects updating a rule into an already occupied weekday for the same professional", async () => {
    prisma.availabilityRule.findFirst
      .mockResolvedValueOnce({
        active: true,
        businessId: "business-1",
        endTime: "18:00",
        id: "rule-current",
        staffMemberId: "staff-1",
        startTime: "09:00",
        weekday: 2
      })
      .mockResolvedValueOnce({
        id: "rule-existing"
      });
    const service = new BusinessesService(outbox as never, prisma as never);

    await expect(
      service.updateAvailabilityRule(user as never, "rule-current", {
        weekday: 1
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.availabilityRule.update).not.toHaveBeenCalled();
  });
});
