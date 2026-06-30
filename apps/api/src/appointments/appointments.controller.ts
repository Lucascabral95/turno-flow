import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { RecurringSeriesStatus } from "@prisma/client";

import { AuthGuard } from "../auth/auth.guard";
import { BusinessContextGuard } from "../common/business-context.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { AppointmentsService } from "./appointments.service";
import { CreateWaitlistEntryDto, RescheduleAppointmentDto, UpdateAppointmentStatusDto } from "./dto/appointment.dto";
import { CreateRecurringSeriesDto, UpdateRecurringSeriesDto } from "./dto/recurring-series.dto";
import { RecurringSeriesService } from "./recurring-series.service";

@ApiTags("appointments")
@UseGuards(AuthGuard, BusinessContextGuard, RolesGuard)
@Controller("appointments")
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly recurringSeries: RecurringSeriesService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.listPrivateAppointments(user);
  }

  @Roles("OWNER", "RECEPTIONIST")
  @Post("recurring-series")
  createRecurringSeries(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecurringSeriesDto) {
    return this.recurringSeries.createSeries(user, dto);
  }

  @Roles("OWNER", "RECEPTIONIST")
  @Get("recurring-series")
  listRecurringSeries(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: RecurringSeriesStatus) {
    return this.recurringSeries.listSeries(user, status);
  }

  @Roles("OWNER", "RECEPTIONIST")
  @Get("recurring-series/:id")
  getRecurringSeries(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.recurringSeries.getSeries(user, id);
  }

  @Roles("OWNER", "RECEPTIONIST")
  @Patch("recurring-series/:id")
  updateRecurringSeries(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringSeriesDto
  ) {
    return this.recurringSeries.updateSeries(user, id, dto);
  }

  @Roles("OWNER", "RECEPTIONIST")
  @Delete("recurring-series/:id")
  cancelRecurringSeries(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.recurringSeries.cancelSeries(user, id);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.getPrivateAppointment(user, id);
  }

  @Patch(":id/confirm")
  confirm(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.confirmPrivateAppointment(user, id);
  }

  @Patch(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.cancelPrivateAppointment(user, id);
  }

  @Patch(":id/reschedule")
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RescheduleAppointmentDto
  ) {
    return this.appointments.reschedulePrivateAppointment(user, id, input);
  }

  @Get(":id/reschedule-slots")
  getRescheduleSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("date") date: string
  ) {
    return this.appointments.getPrivateRescheduleSlots(user, id, date);
  }

  @Patch(":id/complete")
  complete(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.completePrivateAppointment(user, id);
  }

  @Patch(":id/no-show")
  markNoShow(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.markPrivateAppointmentNoShow(user, id);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: UpdateAppointmentStatusDto
  ) {
    return this.appointments.updatePrivateAppointmentStatus(user, id, input);
  }
}

@ApiTags("waitlist")
@UseGuards(AuthGuard)
@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.listPrivateWaitlistEntries(user);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateWaitlistEntryDto) {
    return this.appointments.createPrivateWaitlistEntry(user, input);
  }

  @Patch(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.cancelPrivateWaitlistEntry(user, id);
  }
}

@ApiTags("waitlist-offers")
@UseGuards(AuthGuard)
@Controller("waitlist-offers")
export class WaitlistOffersController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Patch(":id/accept")
  accept(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.acceptPrivateWaitlistOffer(user, id);
  }

  @Patch(":id/reject")
  reject(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.appointments.rejectPrivateWaitlistOffer(user, id);
  }
}
