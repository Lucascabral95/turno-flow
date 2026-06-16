import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthGuard } from "../auth/auth.guard";
import { BusinessesService } from "./businesses.service";
import { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from "./dto/availability-rule.dto";
import { CreateBusinessDto, UpdateBusinessDto } from "./dto/business.dto";
import { CreateServiceDto, UpdateServiceDto } from "./dto/service.dto";
import { CreateStaffMemberDto, UpdateStaffMemberDto } from "./dto/staff-member.dto";

@UseGuards(AuthGuard)
@Controller()
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get("businesses/current")
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.getCurrent(user);
  }

  @Post("businesses/current")
  createCurrent(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateBusinessDto) {
    return this.businesses.createCurrent(user, input);
  }

  @Patch("businesses/current")
  updateCurrent(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateBusinessDto) {
    return this.businesses.updateCurrent(user, input);
  }

  @Get("services")
  listServices(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listServices(user);
  }

  @Post("services")
  createService(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateServiceDto) {
    return this.businesses.createService(user, input);
  }

  @Patch("services/:id")
  updateService(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateServiceDto
  ) {
    return this.businesses.updateService(user, id, input);
  }

  @Delete("services/:id")
  deactivateService(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.businesses.deactivateService(user, id);
  }

  @Get("staff-members")
  listStaffMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listStaffMembers(user);
  }

  @Post("staff-members")
  createStaffMember(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateStaffMemberDto) {
    return this.businesses.createStaffMember(user, input);
  }

  @Patch("staff-members/:id")
  updateStaffMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateStaffMemberDto
  ) {
    return this.businesses.updateStaffMember(user, id, input);
  }

  @Delete("staff-members/:id")
  deactivateStaffMember(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.businesses.deactivateStaffMember(user, id);
  }

  @Get("availability-rules")
  listAvailabilityRules(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listAvailabilityRules(user);
  }

  @Post("availability-rules")
  createAvailabilityRule(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAvailabilityRuleDto) {
    return this.businesses.createAvailabilityRule(user, input);
  }

  @Patch("availability-rules/:id")
  updateAvailabilityRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateAvailabilityRuleDto
  ) {
    return this.businesses.updateAvailabilityRule(user, id, input);
  }

  @Delete("availability-rules/:id")
  deactivateAvailabilityRule(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.businesses.deactivateAvailabilityRule(user, id);
  }
}
