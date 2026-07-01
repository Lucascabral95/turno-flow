import { Module } from "@nestjs/common";

import { AppointmentsModule } from "../appointments/appointments.module";
import { CustomerAuthGuard } from "./customer-auth.guard";
import { CustomerPortalController } from "./customer-portal.controller";
import { CustomerPortalService } from "./customer-portal.service";

@Module({
  controllers: [CustomerPortalController],
  imports: [AppointmentsModule],
  providers: [CustomerPortalService, CustomerAuthGuard]
})
export class CustomerPortalModule {}
