import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BusinessesModule } from "../businesses/businesses.module";
import { EventsModule } from "../events/events.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  controllers: [PaymentsController],
  imports: [AuditModule, BusinessesModule, EventsModule],
  providers: [PaymentsService]
})
export class PaymentsModule {}
