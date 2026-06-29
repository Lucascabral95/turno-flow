import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@UseGuards(AuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("metrics")
  getMetrics(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getMetrics(user);
  }

  @Get("notifications")
  getNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getNotifications(user);
  }
}

@ApiTags("metrics")
@UseGuards(AuthGuard)
@Controller("metrics")
export class MetricsController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("dashboard")
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getMetrics(user);
  }

  @Get("no-shows")
  getNoShows(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getNoShowMetrics(user);
  }

  @Get("revenue-loss")
  getRevenueLoss(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getRevenueLossMetrics(user);
  }

  @Get("revenue")
  getRevenue(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getRevenueMetrics(user);
  }

  @Get("services")
  getServices(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getServiceMetrics(user);
  }

  @Get("customers")
  getCustomers(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getCustomerMetrics(user);
  }

  @Get("occupancy")
  getOccupancy(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getOccupancyMetrics(user);
  }
}
