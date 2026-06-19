import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses/businesses.module";
import { AppointmentsController, WaitlistController, WaitlistOffersController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  controllers: [AppointmentsController, WaitlistController, WaitlistOffersController],
  exports: [AppointmentsService],
  imports: [BusinessesModule],
  providers: [AppointmentsService]
})
export class AppointmentsModule {}
