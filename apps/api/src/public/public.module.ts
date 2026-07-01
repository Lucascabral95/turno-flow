import { Module } from "@nestjs/common";

import { AppointmentsModule } from "../appointments/appointments.module";
import { ReviewsModule } from "../reviews/reviews.module";
import { PublicController } from "./public.controller";

@Module({
  controllers: [PublicController],
  imports: [AppointmentsModule, ReviewsModule]
})
export class PublicModule {}
