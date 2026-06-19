import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthGuard } from "../auth/auth.guard";
import { BusinessesService } from "./businesses.service";
import { CreateAvailabilityExceptionDto, UpdateAvailabilityExceptionDto } from "./dto/availability-exception.dto";
import { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from "./dto/availability-rule.dto";
import { CreateBusinessDto, UpdateBusinessDto } from "./dto/business.dto";
import { UpdateReminderSettingsDto } from "./dto/reminder-settings.dto";
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

  @Get("businesses/me")
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.getCurrent(user);
  }

  @Post("businesses/current")
  createCurrent(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateBusinessDto) {
    return this.businesses.createCurrent(user, input);
  }

  @Post("businesses")
  createBusiness(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateBusinessDto) {
    return this.businesses.createCurrent(user, input);
  }

  @Patch("businesses/current")
  updateCurrent(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateBusinessDto) {
    return this.businesses.updateCurrent(user, input);
  }

  @Patch("businesses/:id")
  updateBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateBusinessDto
  ) {
    return this.businesses.updateBusiness(user, id, input);
  }

  @Get("businesses/current/reminder-settings")
  getReminderSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.getReminderSettings(user);
  }

  @Patch("businesses/current/reminder-settings")
  updateReminderSettings(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateReminderSettingsDto) {
    return this.businesses.updateReminderSettings(user, input);
  }

  @Get("services")
  listServices(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listServices(user);
  }

  @Get("services/:id")
  getService(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.businesses.getService(user, id);
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

  @Get("availability/rules")
  listAvailabilityRulesAlias(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listAvailabilityRules(user);
  }

  @Post("availability-rules")
  createAvailabilityRule(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAvailabilityRuleDto) {
    return this.businesses.createAvailabilityRule(user, input);
  }

  @Post("availability/rules")
  createAvailabilityRuleAlias(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAvailabilityRuleDto) {
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

  @Get("availability-exceptions")
  listAvailabilityExceptions(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listAvailabilityExceptions(user);
  }

  @Get("availability/exceptions")
  listAvailabilityExceptionsAlias(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listAvailabilityExceptions(user);
  }

  @Post("availability-exceptions")
  createAvailabilityException(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAvailabilityExceptionDto) {
    return this.businesses.createAvailabilityException(user, input);
  }

  @Post("availability/exceptions")
  createAvailabilityExceptionAlias(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateAvailabilityExceptionDto) {
    return this.businesses.createAvailabilityException(user, input);
  }

  @Get("availability/slots")
  getAvailabilitySlots(
    @CurrentUser() user: AuthenticatedUser,
    @Query("serviceId", ParseUUIDPipe) serviceId: string,
    @Query("date") date: string
  ) {
    return this.businesses.getAvailabilitySlots(user, serviceId, date);
  }

  @Patch("availability-exceptions/:id")
  updateAvailabilityException(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateAvailabilityExceptionDto
  ) {
    return this.businesses.updateAvailabilityException(user, id, input);
  }

  @Delete("availability-exceptions/:id")
  deleteAvailabilityException(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.businesses.deleteAvailabilityException(user, id);
  }
}
