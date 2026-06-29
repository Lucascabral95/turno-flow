import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BusinessesModule } from "../businesses/businesses.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  controllers: [CustomersController],
  imports: [AuditModule, BusinessesModule],
  providers: [CustomersService]
})
export class CustomersModule {}
