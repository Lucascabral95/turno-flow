import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from "class-validator";

import { onboardingEventTypes, onboardingStepKeys, type OnboardingStepKey } from "../onboarding.types";

export class UpdateOnboardingProgressDto {
  @IsOptional()
  @IsIn(onboardingStepKeys)
  currentStep?: OnboardingStepKey;

  @IsBoolean()
  @IsOptional()
  dismissed?: boolean;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsOptional()
  @IsIn(onboardingEventTypes)
  eventType?: typeof onboardingEventTypes[number];

  @IsOptional()
  @IsString()
  subtaskKey?: string;

  @IsBoolean()
  @IsOptional()
  subtaskCompleted?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, string | number | boolean | null>;
}
