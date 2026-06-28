import { ConflictException, NotFoundException } from "@nestjs/common";
import { OnboardingStep } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessOnboardingService } from "./onboarding.service";

describe("BusinessOnboardingService", () => {
  const prisma = {
    $transaction: vi.fn(async <T>(callback: (tx: typeof prisma) => Promise<T>) => callback(prisma)),
    business: {
      findFirst: vi.fn()
    },
    businessOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    },
    businessOnboardingEvent: {
      create: vi.fn(),
      findMany: vi.fn()
    }
  };

  const user = { email: "owner@turnoflow.local", id: "user-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.businessOnboardingEvent.findMany.mockResolvedValue([]);
  });

  it("returns business as pending step when the user has no business", async () => {
    prisma.business.findFirst.mockResolvedValue(null);
    const service = new BusinessOnboardingService(prisma as never);

    const status = await service.getStatus(user);

    expect(status).toMatchObject({
      currentStep: "business",
      isReadyToSell: false,
      nextStep: "business",
      progressPercent: 0
    });
    expect(status.steps[0]?.tasks.length).toBeGreaterThan(0);
  });

  it("returns service as next step when business exists without active services", async () => {
    prisma.business.findFirst.mockResolvedValue({
      availabilityRules: [],
      email: null,
      id: "business-1",
      name: "Lucas Barber",
      onboarding: null,
      onboardingEvents: [],
      services: [],
      slug: "lucas-barber",
      staffMembers: [],
      timezone: "America/Argentina/Buenos_Aires"
    });
    const service = new BusinessOnboardingService(prisma as never);

    const status = await service.getStatus(user);

    expect(status).toMatchObject({
      currentStep: "service",
      nextStep: "service",
      progressPercent: 20
    });
  });

  it("returns staff as next step when there is at least one active service but no active professional", async () => {
    prisma.business.findFirst.mockResolvedValue({
      availabilityRules: [],
      email: null,
      id: "business-1",
      name: "Lucas Barber",
      onboarding: null,
      onboardingEvents: [],
      services: [{ active: true, bufferMinutes: 10, durationMinutes: 30, id: "service-1", priceCents: 1200 }],
      slug: "lucas-barber",
      staffMembers: [],
      timezone: "America/Argentina/Buenos_Aires"
    });
    const service = new BusinessOnboardingService(prisma as never);

    const status = await service.getStatus(user);

    expect(status.nextStep).toBe("staff");
  });

  it("returns availability as next step when there is service and staff but no weekly rule", async () => {
    prisma.business.findFirst.mockResolvedValue({
      availabilityRules: [],
      email: null,
      id: "business-1",
      name: "Lucas Barber",
      onboarding: null,
      onboardingEvents: [],
      services: [{ active: true, bufferMinutes: 10, durationMinutes: 30, id: "service-1", priceCents: 1200 }],
      slug: "lucas-barber",
      staffMembers: [{ active: true, email: "staff@turnoflow.local", id: "staff-1", name: "Lucas" }],
      timezone: "America/Argentina/Buenos_Aires"
    });
    const service = new BusinessOnboardingService(prisma as never);

    const status = await service.getStatus(user);

    expect(status.nextStep).toBe("availability");
  });

  it("returns public page as ready state when the minimum setup is complete", async () => {
    prisma.business.findFirst.mockResolvedValue({
      availabilityRules: [{ active: true, id: "rule-1", staffMemberId: "staff-1", weekday: 1 }],
      email: "owner@turnoflow.local",
      id: "business-1",
      name: "Lucas Barber",
      onboarding: {
        businessId: "business-1",
        completedAt: new Date("2026-06-28T10:00:00.000Z"),
        createdAt: new Date("2026-06-28T09:00:00.000Z"),
        currentStep: OnboardingStep.PUBLIC_PAGE,
        dismissedAt: null,
        progressData: {
          public_page: {
            share_page: { completed: true, completedAt: "2026-06-28T09:30:00.000Z" },
            test_booking: { completed: true, completedAt: "2026-06-28T09:45:00.000Z" }
          }
        },
        updatedAt: new Date("2026-06-28T10:00:00.000Z")
      },
      onboardingEvents: [],
      services: [{ active: true, bufferMinutes: 10, durationMinutes: 30, id: "service-1", priceCents: 1200 }],
      slug: "lucas-barber",
      staffMembers: [{ active: true, email: "staff@turnoflow.local", id: "staff-1", name: "Lucas" }],
      timezone: "America/Argentina/Buenos_Aires"
    });
    const service = new BusinessOnboardingService(prisma as never);

    const status = await service.getStatus(user);

    expect(status).toMatchObject({
      currentStep: "public_page",
      isReadyToSell: true,
      nextStep: "public_page",
      progressPercent: 100
    });
    expect(status.steps.find((step) => step.key === "public_page")?.progressPercent).toBe(100);
  });

  it("updates onboarding progress only for the current tenant business", async () => {
    prisma.business.findFirst
      .mockResolvedValueOnce({
        availabilityRules: [],
        email: null,
        id: "business-1",
        name: "Lucas Barber",
        onboarding: null,
        onboardingEvents: [],
        services: [],
        slug: "lucas-barber",
        staffMembers: [],
        timezone: "America/Argentina/Buenos_Aires"
      })
      .mockResolvedValueOnce({
        availabilityRules: [],
        email: null,
        id: "business-1",
        name: "Lucas Barber",
        onboarding: {
          businessId: "business-1",
          completedAt: null,
          createdAt: new Date("2026-06-28T09:00:00.000Z"),
          currentStep: OnboardingStep.SERVICE,
          dismissedAt: new Date("2026-06-28T09:10:00.000Z"),
          progressData: null,
          updatedAt: new Date("2026-06-28T09:10:00.000Z")
        },
        onboardingEvents: [],
        services: [],
        slug: "lucas-barber",
        staffMembers: [],
        timezone: "America/Argentina/Buenos_Aires"
      });
    const service = new BusinessOnboardingService(prisma as never);

    await service.updateProgress(user, {
      currentStep: "service",
      dismissed: true
    });

    expect(prisma.businessOnboarding.upsert.mock.calls[0]?.[0]).toMatchObject({
      create: {
        businessId: "business-1",
        currentStep: OnboardingStep.SERVICE
      },
      where: { businessId: "business-1" }
    });
    expect(prisma.businessOnboardingEvent.create).toHaveBeenCalled();
  });

  it("stores public page subtasks and analytics events", async () => {
    prisma.business.findFirst
      .mockResolvedValueOnce({
        availabilityRules: [{ active: true, id: "rule-1", staffMemberId: "staff-1", weekday: 1 }],
        email: "owner@turnoflow.local",
        id: "business-1",
        name: "Lucas Barber",
        onboarding: {
          businessId: "business-1",
          completedAt: null,
          createdAt: new Date("2026-06-28T09:00:00.000Z"),
          currentStep: OnboardingStep.PUBLIC_PAGE,
          dismissedAt: null,
          progressData: null,
          updatedAt: new Date("2026-06-28T09:10:00.000Z")
        },
        onboardingEvents: [],
        services: [{ active: true, bufferMinutes: 10, durationMinutes: 30, id: "service-1", priceCents: 1200 }],
        slug: "lucas-barber",
        staffMembers: [{ active: true, email: "staff@turnoflow.local", id: "staff-1", name: "Lucas" }],
        timezone: "America/Argentina/Buenos_Aires"
      })
      .mockResolvedValueOnce({
        availabilityRules: [{ active: true, id: "rule-1", staffMemberId: "staff-1", weekday: 1 }],
        email: "owner@turnoflow.local",
        id: "business-1",
        name: "Lucas Barber",
        onboarding: {
          businessId: "business-1",
          completedAt: null,
          createdAt: new Date("2026-06-28T09:00:00.000Z"),
          currentStep: OnboardingStep.PUBLIC_PAGE,
          dismissedAt: null,
          progressData: {
            public_page: {
              share_page: { completed: true, completedAt: "2026-06-28T09:12:00.000Z" }
            }
          },
          updatedAt: new Date("2026-06-28T09:12:00.000Z")
        },
        onboardingEvents: [
          {
            businessId: "business-1",
            createdAt: new Date("2026-06-28T09:12:00.000Z"),
            eventType: "share_clicked",
            id: "event-1",
            metadata: null,
            step: OnboardingStep.PUBLIC_PAGE
          }
        ],
        services: [{ active: true, bufferMinutes: 10, durationMinutes: 30, id: "service-1", priceCents: 1200 }],
        slug: "lucas-barber",
        staffMembers: [{ active: true, email: "staff@turnoflow.local", id: "staff-1", name: "Lucas" }],
        timezone: "America/Argentina/Buenos_Aires"
      });
    const service = new BusinessOnboardingService(prisma as never);

    const result = await service.updateProgress(user, {
      currentStep: "public_page",
      eventType: "share_clicked",
      subtaskCompleted: true,
      subtaskKey: "share_page"
    });

    expect(prisma.businessOnboarding.upsert.mock.calls[0]?.[0]).toMatchObject({
      update: {
        progressData: {
          public_page: {
            share_page: {
              completed: true
            }
          }
        }
      }
    });
    expect(result.analytics.lastSharedAt).toBe("2026-06-28T09:12:00.000Z");
  });

  it("rejects unknown onboarding steps", async () => {
    prisma.business.findFirst.mockResolvedValue({
      availabilityRules: [],
      email: null,
      id: "business-1",
      name: "Lucas Barber",
      onboarding: null,
      onboardingEvents: [],
      services: [],
      slug: "lucas-barber",
      staffMembers: [],
      timezone: "America/Argentina/Buenos_Aires"
    });
    const service = new BusinessOnboardingService(prisma as never);

    await expect(service.updateProgress(user, { currentStep: "wrong" as never })).rejects.toBeInstanceOf(ConflictException);
  });

  it("fails to update progress when no business is configured", async () => {
    prisma.business.findFirst.mockResolvedValue(null);
    const service = new BusinessOnboardingService(prisma as never);

    await expect(service.updateProgress(user, { dismissed: true })).rejects.toBeInstanceOf(NotFoundException);
  });
});
