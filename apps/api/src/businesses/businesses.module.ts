import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";
import { OnboardingController } from "./onboarding.controller";
import { BusinessOnboardingService } from "./onboarding.service";

@Module({
  controllers: [BusinessesController, OnboardingController],
  exports: [BusinessesService],
  imports: [AuditModule],
  providers: [BusinessesService, BusinessOnboardingService]
})
export class BusinessesModule {}
