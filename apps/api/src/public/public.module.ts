import { Module } from "@nestjs/common";

import { AppointmentsModule } from "../appointments/appointments.module";
import { PublicController } from "./public.controller";

@Module({
  controllers: [PublicController],
  imports: [AppointmentsModule]
})
export class PublicModule {}
