import { Module } from "@nestjs/common";

import { AppointmentsModule } from "../appointments/appointments.module";
import { CustomersModule } from "../customers/customers.module";
import { ReviewsModule } from "../reviews/reviews.module";
import { PublicController } from "./public.controller";

@Module({
  controllers: [PublicController],
  imports: [AppointmentsModule, CustomersModule, ReviewsModule]
})
export class PublicModule {}
