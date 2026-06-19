import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses/businesses.module";
import { DashboardController, MetricsController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController, MetricsController],
  imports: [BusinessesModule],
  providers: [DashboardService]
})
export class DashboardModule {}
