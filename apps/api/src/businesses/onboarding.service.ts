import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { type BusinessOnboarding as PrismaBusinessOnboarding, type BusinessOnboardingEvent as PrismaBusinessOnboardingEvent, Prisma } from "@prisma/client";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateOnboardingProgressDto } from "./dto/onboarding-progress.dto";
import {
  type OnboardingAnalytics,
  type OnboardingAnalyticsStep,
  type OnboardingEventType,
  type OnboardingStatus,
  type OnboardingStepKey,
  type OnboardingTaskStatus,
  onboardingStepKeys,
  onboardingStepMeta,
  onboardingStepToPrisma,
  prismaToOnboardingStep
} from "./onboarding.types";

type ProgressData = Partial<Record<OnboardingStepKey, Record<string, { completed: boolean; completedAt: string | null }>>>;

type BusinessSnapshot = {
  email: string | null;
  id: string;
  name: string;
  onboarding: PrismaBusinessOnboarding | null;
  onboardingEvents: PrismaBusinessOnboardingEvent[];
  services: Array<{ active: boolean; bufferMinutes: number; durationMinutes: number; id: string; priceCents: number }>;
  slug: string;
  staffMembers: Array<{ active: boolean; email: string | null; id: string; name: string }>;
  timezone: string;
  availabilityRules: Array<{ active: boolean; id: string; staffMemberId: string; weekday: number }>;
};

@Injectable()
export class BusinessOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(user: AuthenticatedUser): Promise<OnboardingStatus> {
    const business = await this.findBusinessSnapshotForUser(user.id);
    return this.buildStatusFromSnapshot(business);
  }

  async getStatusForBusinessSnapshot(business: Omit<BusinessSnapshot, "onboarding" | "onboardingEvents">): Promise<OnboardingStatus> {
    const [onboarding, onboardingEvents] = await Promise.all([
      this.prisma.businessOnboarding.findUnique({
        where: { businessId: business.id }
      }),
      this.prisma.businessOnboardingEvent.findMany({
        orderBy: { createdAt: "asc" },
        where: { businessId: business.id }
      })
    ]);

    return this.buildStatusFromSnapshot({
      ...business,
      onboarding,
      onboardingEvents
    });
  }

  async updateProgress(user: AuthenticatedUser, input: UpdateOnboardingProgressDto): Promise<OnboardingStatus> {
    const business = await this.findBusinessSnapshotForUser(user.id);

    if (!business) {
      throw new NotFoundException("Current business is not configured");
    }

    const status = this.buildStatusFromSnapshot(business);
    const requestedStep = input.currentStep ? this.normalizeStep(input.currentStep) : status.currentStep;
    const progressData = this.mergeProgressData({
      eventType: input.eventType,
      existing: this.parseProgressData(business.onboarding?.progressData),
      step: requestedStep,
      subtaskCompleted: input.subtaskCompleted,
      subtaskKey: input.subtaskKey
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.businessOnboarding.upsert({
        create: {
          businessId: business.id,
          completedAt: input.completed && status.isReadyToSell ? new Date() : null,
          currentStep: onboardingStepToPrisma[requestedStep],
          dismissedAt: input.dismissed ? new Date() : null,
          progressData
        },
        update: {
          completedAt: input.completed && status.isReadyToSell ? new Date() : undefined,
          currentStep: onboardingStepToPrisma[requestedStep],
          dismissedAt: input.dismissed === undefined ? undefined : input.dismissed ? new Date() : null,
          progressData
        },
        where: { businessId: business.id }
      });

      const eventType = this.resolveEventType(input, status.currentStep, requestedStep, status.isReadyToSell);

      if (eventType) {
        await tx.businessOnboardingEvent.create({
          data: {
            businessId: business.id,
            eventType,
            metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
            step: onboardingStepToPrisma[requestedStep]
          }
        });
      }
    });

    return this.getStatus(user);
  }

  private async findBusinessSnapshotForUser(userId: string): Promise<BusinessSnapshot | null> {
    return this.prisma.business.findFirst({
      include: {
        onboarding: true,
        onboardingEvents: {
          orderBy: { createdAt: "asc" }
        },
        availabilityRules: {
          select: { active: true, id: true, staffMemberId: true, weekday: true },
          where: { active: true }
        },
        services: {
          select: { active: true, bufferMinutes: true, durationMinutes: true, id: true, priceCents: true },
          where: { active: true }
        },
        staffMembers: {
          select: { active: true, email: true, id: true, name: true },
          where: { active: true }
        }
      },
      where: {
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                active: true,
                userId
              }
            }
          }
        ]
      }
    });
  }

  private buildStatusFromSnapshot(business: BusinessSnapshot | null): OnboardingStatus {
    if (!business) {
      const emptySteps = onboardingStepKeys.map((key) => ({
        completed: false,
        description: onboardingStepMeta[key].description,
        key,
        progressPercent: 0,
        tasks: this.emptyTasks(key),
        title: onboardingStepMeta[key].title
      }));

      return {
        analytics: this.buildAnalytics("business", false, [], null),
        completedAt: null,
        currentStep: "business",
        dismissedAt: null,
        isReadyToSell: false,
        nextStep: "business",
        progressPercent: 0,
        steps: emptySteps
      };
    }

    const progressData = this.parseProgressData(business.onboarding?.progressData);
    const businessTasks = this.buildBusinessTasks(business);
    const serviceTasks = this.buildServiceTasks(business);
    const staffTasks = this.buildStaffTasks(business);
    const availabilityTasks = this.buildAvailabilityTasks(business);
    const publicPageTasks = this.buildPublicPageTasks(business, progressData);
    const taskMap: Record<OnboardingStepKey, OnboardingTaskStatus[]> = {
      availability: availabilityTasks,
      business: businessTasks,
      public_page: publicPageTasks,
      service: serviceTasks,
      staff: staffTasks
    };

    const stepCompletion: Record<OnboardingStepKey, boolean> = {
      availability: business.availabilityRules.length > 0,
      business: Boolean(business.name.trim() && business.slug.trim() && business.timezone.trim()),
      public_page:
        Boolean(business.slug.trim()) &&
        business.services.length > 0 &&
        business.staffMembers.length > 0 &&
        business.availabilityRules.length > 0,
      service: business.services.length > 0,
      staff: business.staffMembers.length > 0
    };

    const steps = onboardingStepKeys.map((key) => ({
      completed: stepCompletion[key],
      description: onboardingStepMeta[key].description,
      key,
      progressPercent: this.calculateTaskProgress(taskMap[key]),
      tasks: taskMap[key],
      title: onboardingStepMeta[key].title
    }));

    const nextStep = steps.find((step) => !step.completed)?.key ?? "public_page";
    const completedCount = steps.filter((step) => step.completed).length;
    const isReadyToSell = steps.every((step) => step.completed);
    const progressPercent = Math.round((completedCount / steps.length) * 100);
    const persistedCurrentStep = business.onboarding ? prismaToOnboardingStep[business.onboarding.currentStep] : nextStep;
    const currentStep = isReadyToSell ? "public_page" : persistedCurrentStep;

    return {
      analytics: this.buildAnalytics(currentStep, isReadyToSell, business.onboardingEvents, business.onboarding),
      completedAt: business.onboarding?.completedAt?.toISOString() ?? null,
      currentStep,
      dismissedAt: business.onboarding?.dismissedAt?.toISOString() ?? null,
      isReadyToSell,
      nextStep,
      progressPercent,
      steps
    };
  }

  private buildBusinessTasks(business: BusinessSnapshot): OnboardingTaskStatus[] {
    return [
      { completed: business.name.trim().length > 0, key: "name", required: true, title: "Nombre del negocio" },
      { completed: business.slug.trim().length > 0, key: "slug", required: true, title: "Slug publico" },
      { completed: business.timezone.trim().length > 0, key: "timezone", required: true, title: "Zona horaria" },
      { completed: Boolean(business.email?.trim()), key: "email", required: false, title: "Email de contacto" }
    ];
  }

  private buildServiceTasks(business: BusinessSnapshot): OnboardingTaskStatus[] {
    const firstService = business.services[0] ?? null;

    return [
      { completed: business.services.length > 0, key: "service_exists", required: true, title: "Primer servicio activo" },
      { completed: Boolean(firstService && firstService.durationMinutes >= 5), key: "duration", required: true, title: "Duracion configurada" },
      { completed: Boolean(firstService && firstService.priceCents >= 0), key: "price", required: false, title: "Precio visible" },
      { completed: Boolean(firstService && firstService.bufferMinutes >= 0), key: "buffer", required: false, title: "Buffer definido" }
    ];
  }

  private buildStaffTasks(business: BusinessSnapshot): OnboardingTaskStatus[] {
    const firstStaffMember = business.staffMembers[0] ?? null;

    return [
      { completed: business.staffMembers.length > 0, key: "staff_exists", required: true, title: "Primer profesional activo" },
      { completed: Boolean(firstStaffMember && firstStaffMember.name.trim().length > 0), key: "staff_name", required: true, title: "Nombre visible" },
      { completed: Boolean(firstStaffMember?.email?.trim()), key: "staff_email", required: false, title: "Email de contacto" }
    ];
  }

  private buildAvailabilityTasks(business: BusinessSnapshot): OnboardingTaskStatus[] {
    const coveredWeekdays = new Set(business.availabilityRules.map((rule) => rule.weekday));

    return [
      { completed: business.availabilityRules.length > 0, key: "rule_exists", required: true, title: "Al menos una regla activa" },
      { completed: coveredWeekdays.size >= 5, key: "weekday_coverage", required: false, title: "Cobertura de cinco dias" },
      { completed: business.availabilityRules.some((rule) => business.staffMembers.some((staff) => staff.id === rule.staffMemberId)), key: "assigned_staff", required: true, title: "Asignada a profesional activo" }
    ];
  }

  private buildPublicPageTasks(business: BusinessSnapshot, progressData: ProgressData): OnboardingTaskStatus[] {
    const publicPageState = progressData.public_page ?? {};

    return [
      { completed: business.slug.trim().length > 0, key: "public_url", required: true, title: "URL publica disponible" },
      { completed: business.services.length > 0 && business.availabilityRules.length > 0, key: "booking_ready", required: true, title: "Flujo de reserva habilitado" },
      { completed: Boolean(publicPageState.share_page?.completed), key: "share_page", required: false, title: "Pagina compartida" },
      { completed: Boolean(publicPageState.test_booking?.completed), key: "test_booking", required: false, title: "Reserva de prueba revisada" }
    ];
  }

  private emptyTasks(step: OnboardingStepKey): OnboardingTaskStatus[] {
    if (step === "business") {
      return [
        { completed: false, key: "name", required: true, title: "Nombre del negocio" },
        { completed: false, key: "slug", required: true, title: "Slug publico" },
        { completed: false, key: "timezone", required: true, title: "Zona horaria" },
        { completed: false, key: "email", required: false, title: "Email de contacto" }
      ];
    }

    if (step === "service") {
      return [
        { completed: false, key: "service_exists", required: true, title: "Primer servicio activo" },
        { completed: false, key: "duration", required: true, title: "Duracion configurada" },
        { completed: false, key: "price", required: false, title: "Precio visible" },
        { completed: false, key: "buffer", required: false, title: "Buffer definido" }
      ];
    }

    if (step === "staff") {
      return [
        { completed: false, key: "staff_exists", required: true, title: "Primer profesional activo" },
        { completed: false, key: "staff_name", required: true, title: "Nombre visible" },
        { completed: false, key: "staff_email", required: false, title: "Email de contacto" }
      ];
    }

    if (step === "availability") {
      return [
        { completed: false, key: "rule_exists", required: true, title: "Al menos una regla activa" },
        { completed: false, key: "weekday_coverage", required: false, title: "Cobertura de cinco dias" },
        { completed: false, key: "assigned_staff", required: true, title: "Asignada a profesional activo" }
      ];
    }

    return [
      { completed: false, key: "public_url", required: true, title: "URL publica disponible" },
      { completed: false, key: "booking_ready", required: true, title: "Flujo de reserva habilitado" },
      { completed: false, key: "share_page", required: false, title: "Pagina compartida" },
      { completed: false, key: "test_booking", required: false, title: "Reserva de prueba revisada" }
    ];
  }

  private parseProgressData(value: Prisma.JsonValue | null | undefined): ProgressData {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value;
  }

  private mergeProgressData({
    eventType,
    existing,
    step,
    subtaskCompleted,
    subtaskKey
  }: {
    eventType?: OnboardingEventType;
    existing: ProgressData;
    step: OnboardingStepKey;
    subtaskCompleted?: boolean;
    subtaskKey?: string;
  }): ProgressData {
    const next = { ...existing };
    const currentStep = { ...(next[step] ?? {}) };

    if (subtaskKey) {
      currentStep[subtaskKey] = {
        completed: subtaskCompleted ?? true,
        completedAt: subtaskCompleted === false ? null : new Date().toISOString()
      };
    }

    if (eventType === "share_clicked") {
      currentStep.share_page = {
        completed: true,
        completedAt: new Date().toISOString()
      };
    }

    if (eventType === "test_booking_clicked") {
      currentStep.test_booking = {
        completed: true,
        completedAt: new Date().toISOString()
      };
    }

    if (Object.keys(currentStep).length > 0) {
      next[step] = currentStep;
    }

    return next;
  }

  private calculateTaskProgress(tasks: OnboardingTaskStatus[]): number {
    if (tasks.length === 0) {
      return 0;
    }

    return Math.round((tasks.filter((task) => task.completed).length / tasks.length) * 100);
  }

  private buildAnalytics(
    currentStep: OnboardingStepKey,
    isReadyToSell: boolean,
    events: PrismaBusinessOnboardingEvent[],
    onboarding: PrismaBusinessOnboarding | null
  ): OnboardingAnalytics {
    const lastActivityAt = events.at(-1)?.createdAt.toISOString() ?? onboarding?.updatedAt?.toISOString() ?? null;
    const lastDismissedAt = [...events]
      .reverse()
      .find((event) => event.eventType === "dismissed")
      ?.createdAt.toISOString() ?? null;
    const lastSharedAt = [...events]
      .reverse()
      .find((event) => event.eventType === "share_clicked")
      ?.createdAt.toISOString() ?? null;
    const lastTestBookingAt = [...events]
      .reverse()
      .find((event) => event.eventType === "test_booking_clicked")
      ?.createdAt.toISOString() ?? null;
    const currentStepEnteredAt = [...events]
      .reverse()
      .find((event) => event.step && prismaToOnboardingStep[event.step] === currentStep && (event.eventType === "advanced" || event.eventType === "viewed" || event.eventType === "resumed"))
      ?.createdAt.toISOString() ?? onboarding?.updatedAt.toISOString() ?? null;
    const stalledStep =
      !isReadyToSell && currentStepEnteredAt && Date.now() - new Date(currentStepEnteredAt).getTime() > 1000 * 60 * 60 * 24
        ? currentStep
        : null;

    return {
      currentStepEnteredAt,
      dismissCount: events.filter((event) => event.eventType === "dismissed").length,
      lastActivityAt,
      lastDismissedAt,
      lastSharedAt,
      lastTestBookingAt,
      stalledStep,
      steps: onboardingStepKeys.map((stepKey) => this.buildAnalyticsStep(stepKey, events))
    };
  }

  private buildAnalyticsStep(stepKey: OnboardingStepKey, events: PrismaBusinessOnboardingEvent[]): OnboardingAnalyticsStep {
    const stepEvents = events.filter((event) => event.step && prismaToOnboardingStep[event.step] === stepKey);
    const lastViewedAt = [...stepEvents]
      .reverse()
      .find((event) => event.eventType === "viewed")
      ?.createdAt.toISOString() ?? null;
    const completedAt = [...stepEvents]
      .reverse()
      .find((event) => event.eventType === "advanced" || event.eventType === "completed")
      ?.createdAt.toISOString() ?? null;

    return {
      abandonmentCount: stepEvents.filter((event) => event.eventType === "dismissed").length,
      completedAt,
      eventCount: stepEvents.length,
      key: stepKey,
      lastActivityAt: stepEvents.at(-1)?.createdAt.toISOString() ?? null,
      lastViewedAt
    };
  }

  private resolveEventType(
    input: UpdateOnboardingProgressDto,
    currentStep: OnboardingStepKey,
    requestedStep: OnboardingStepKey,
    isReadyToSell: boolean
  ): OnboardingEventType | null {
    if (input.eventType) {
      return input.eventType;
    }

    if (input.completed && isReadyToSell) {
      return "completed";
    }

    if (input.dismissed === true) {
      return "dismissed";
    }

    if (input.dismissed === false) {
      return "resumed";
    }

    if (requestedStep !== currentStep) {
      return "advanced";
    }

    if (input.subtaskKey) {
      return "viewed";
    }

    return null;
  }

  private normalizeStep(step: string): OnboardingStepKey {
    if (!onboardingStepKeys.includes(step as OnboardingStepKey)) {
      throw new ConflictException("Invalid onboarding step");
    }

    return step as OnboardingStepKey;
  }
}
