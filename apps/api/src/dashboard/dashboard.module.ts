import { Module } from "@nestjs/common";

import { BusinessesModule } from "../businesses/businesses.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController],
  imports: [BusinessesModule],
  providers: [DashboardService]
})
export class DashboardModule {}
