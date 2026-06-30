import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BusinessesModule } from "../businesses/businesses.module";
import { CommonModule } from "../common/common.module";
import { AppointmentsController, WaitlistController, WaitlistOffersController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { RecurringSeriesService } from "./recurring-series.service";

@Module({
  controllers: [AppointmentsController, WaitlistController, WaitlistOffersController],
  exports: [AppointmentsService, RecurringSeriesService],
  imports: [AuditModule, BusinessesModule, CommonModule],
  providers: [AppointmentsService, RecurringSeriesService]
})
export class AppointmentsModule {}
