import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BusinessesModule } from "../businesses/businesses.module";
import { AppointmentsController, WaitlistController, WaitlistOffersController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  controllers: [AppointmentsController, WaitlistController, WaitlistOffersController],
  exports: [AppointmentsService],
  imports: [AuditModule, BusinessesModule],
  providers: [AppointmentsService]
})
export class AppointmentsModule {}
