import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses/businesses.module";
import { BusinessContextGuard } from "../common/business-context.guard";
import { RolesGuard } from "../common/roles.guard";
import { DashboardController, MetricsController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController, MetricsController],
  imports: [BusinessesModule],
  providers: [DashboardService, BusinessContextGuard, RolesGuard]
})
export class DashboardModule {}
