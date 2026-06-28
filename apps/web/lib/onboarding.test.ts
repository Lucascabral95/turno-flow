import { describe, expect, it } from "vitest";

import { resolveWizardStep, shouldAutoOpenOnboarding } from "./onboarding";

const baseStatus = {
  analytics: {
    currentStepEnteredAt: null,
    dismissCount: 0,
    lastActivityAt: null,
    lastDismissedAt: null,
    lastSharedAt: null,
    lastTestBookingAt: null,
    stalledStep: null,
    steps: []
  },
  completedAt: null,
  currentStep: "service" as const,
  dismissedAt: null,
  isReadyToSell: false,
  nextStep: "service" as const,
  progressPercent: 20,
  steps: []
};

describe("onboarding helpers", () => {
  it("uses the next incomplete step by default", () => {
    expect(resolveWizardStep(baseStatus)).toBe("service");
  });

  it("does not allow skipping ahead of the next incomplete step", () => {
    expect(resolveWizardStep(baseStatus, "public_page")).toBe("service");
  });

  it("allows revisiting an earlier step", () => {
    expect(resolveWizardStep(baseStatus, "business")).toBe("business");
  });

  it("opens the wizard automatically only when setup is incomplete and not dismissed", () => {
    expect(shouldAutoOpenOnboarding(baseStatus)).toBe(true);
    expect(shouldAutoOpenOnboarding({ ...baseStatus, dismissedAt: "2026-06-28T12:00:00.000Z" })).toBe(false);
    expect(shouldAutoOpenOnboarding({ ...baseStatus, isReadyToSell: true, nextStep: "public_page", progressPercent: 100 })).toBe(false);
  });
});
