import { OnboardingStep } from "@prisma/client";

export const onboardingStepKeys = ["business", "service", "staff", "availability", "public_page"] as const;

export type OnboardingStepKey = (typeof onboardingStepKeys)[number];

export type OnboardingStepStatus = {
  completed: boolean;
  description: string;
  key: OnboardingStepKey;
  progressPercent: number;
  tasks: OnboardingTaskStatus[];
  title: string;
};

export type OnboardingTaskStatus = {
  completed: boolean;
  key: string;
  required: boolean;
  title: string;
};

export type OnboardingAnalyticsStep = {
  abandonmentCount: number;
  completedAt: string | null;
  eventCount: number;
  key: OnboardingStepKey;
  lastActivityAt: string | null;
  lastViewedAt: string | null;
};

export type OnboardingAnalytics = {
  currentStepEnteredAt: string | null;
  dismissCount: number;
  lastActivityAt: string | null;
  lastDismissedAt: string | null;
  lastSharedAt: string | null;
  lastTestBookingAt: string | null;
  stalledStep: OnboardingStepKey | null;
  steps: OnboardingAnalyticsStep[];
};

export type OnboardingStatus = {
  analytics: OnboardingAnalytics;
  completedAt: string | null;
  currentStep: OnboardingStepKey;
  dismissedAt: string | null;
  isReadyToSell: boolean;
  nextStep: OnboardingStepKey;
  progressPercent: number;
  steps: OnboardingStepStatus[];
};

export const onboardingEventTypes = [
  "viewed",
  "dismissed",
  "resumed",
  "advanced",
  "completed",
  "share_clicked",
  "test_booking_clicked",
  "public_page_opened"
] as const;

export type OnboardingEventType = (typeof onboardingEventTypes)[number];

export const onboardingStepToPrisma: Record<OnboardingStepKey, OnboardingStep> = {
  availability: OnboardingStep.AVAILABILITY,
  business: OnboardingStep.BUSINESS,
  public_page: OnboardingStep.PUBLIC_PAGE,
  service: OnboardingStep.SERVICE,
  staff: OnboardingStep.STAFF
};

export const prismaToOnboardingStep: Record<OnboardingStep, OnboardingStepKey> = {
  [OnboardingStep.AVAILABILITY]: "availability",
  [OnboardingStep.BUSINESS]: "business",
  [OnboardingStep.PUBLIC_PAGE]: "public_page",
  [OnboardingStep.SERVICE]: "service",
  [OnboardingStep.STAFF]: "staff"
};

export const onboardingStepMeta: Record<OnboardingStepKey, { description: string; title: string }> = {
  availability: {
    description: "Define una cobertura semanal activa para empezar a ofrecer horarios reales.",
    title: "Disponibilidad"
  },
  business: {
    description: "Configura nombre, slug publico, zona horaria y datos base del negocio.",
    title: "Negocio"
  },
  public_page: {
    description: "Revisa la URL publica, haz una reserva de prueba y deja el flujo listo para vender.",
    title: "Pagina publica"
  },
  service: {
    description: "Crea al menos un servicio activo con duracion, precio y buffer.",
    title: "Servicio"
  },
  staff: {
    description: "Agrega al menos un profesional activo para asignar turnos y agenda.",
    title: "Profesional"
  }
};
