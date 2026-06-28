import type { OnboardingStatus, OnboardingStepKey } from "./api";

const orderedSteps: OnboardingStepKey[] = ["business", "service", "staff", "availability", "public_page"];

export function resolveWizardStep(status: OnboardingStatus | null, requestedStep?: string | null): OnboardingStepKey {
  if (!status) {
    return "business";
  }

  const fallbackStep = status.isReadyToSell ? "public_page" : status.nextStep;

  if (!requestedStep || !orderedSteps.includes(requestedStep as OnboardingStepKey)) {
    return fallbackStep;
  }

  const requestedIndex = orderedSteps.indexOf(requestedStep as OnboardingStepKey);
  const fallbackIndex = orderedSteps.indexOf(fallbackStep);

  if (!status.isReadyToSell && requestedIndex > fallbackIndex) {
    return fallbackStep;
  }

  return requestedStep as OnboardingStepKey;
}

export function shouldAutoOpenOnboarding(status: OnboardingStatus | null): boolean {
  return Boolean(status && !status.isReadyToSell && !status.dismissedAt);
}
