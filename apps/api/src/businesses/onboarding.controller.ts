import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { UpdateOnboardingProgressDto } from "./dto/onboarding-progress.dto";
import { BusinessOnboardingService } from "./onboarding.service";

@UseGuards(AuthGuard)
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: BusinessOnboardingService) {}

  @Get("status")
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.getStatus(user);
  }

  @Get("analytics")
  async getAnalytics(@CurrentUser() user: AuthenticatedUser) {
    const status = await this.onboarding.getStatus(user);
    return status.analytics;
  }

  @Patch("progress")
  updateProgress(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateOnboardingProgressDto) {
    return this.onboarding.updateProgress(user, input);
  }
}
