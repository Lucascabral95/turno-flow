import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses/businesses.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
  imports: [BusinessesModule],
  providers: [AppointmentsService]
})
export class AppointmentsModule {}
