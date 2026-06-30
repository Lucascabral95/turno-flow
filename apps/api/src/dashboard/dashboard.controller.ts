import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BusinessMemberRole } from "@prisma/client";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { BusinessContextGuard } from "../common/business-context.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { DashboardService } from "./dashboard.service";

const { OWNER, PROFESSIONAL, RECEPTIONIST } = BusinessMemberRole;

@ApiTags("dashboard")
@UseGuards(AuthGuard, BusinessContextGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles(OWNER, RECEPTIONIST)
  @Get("metrics")
  getMetrics(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("notifications")
  getNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getNotifications(user);
  }
}

@ApiTags("metrics")
@UseGuards(AuthGuard, BusinessContextGuard, RolesGuard)
@Controller("metrics")
export class MetricsController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles(OWNER, RECEPTIONIST)
  @Get("dashboard")
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("no-shows")
  getNoShows(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getNoShowMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("revenue-loss")
  getRevenueLoss(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getRevenueLossMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("revenue")
  getRevenue(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getRevenueMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("services")
  getServices(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getServiceMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("customers")
  getCustomers(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getCustomerMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("occupancy")
  getOccupancy(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getOccupancyMetrics(user);
  }

  @Roles(OWNER, RECEPTIONIST)
  @Get("staff")
  getStaffMetrics(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getStaffMetricsList(user);
  }

  @Roles(OWNER, RECEPTIONIST, PROFESSIONAL)
  @Get("staff/:staffId")
  getStaffMemberMetrics(
    @CurrentUser() user: AuthenticatedUser,
    @Param("staffId", ParseUUIDPipe) staffId: string
  ) {
    return this.dashboard.getStaffMemberMetrics(user, staffId);
  }
}
