import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";

@Module({
  controllers: [BusinessesController],
  exports: [BusinessesService],
  imports: [AuditModule],
  providers: [BusinessesService]
})
export class BusinessesModule {}
