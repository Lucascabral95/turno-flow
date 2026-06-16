import { Controller, Get, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { DashboardService } from "./dashboard.service";

@UseGuards(AuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("metrics")
  getMetrics(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getMetrics(user);
  }
}
