import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { AppointmentsService } from "./appointments.service";
import { CreateWaitlistEntryDto, UpdateAppointmentStatusDto } from "./dto/appointment.dto";

@UseGuards(AuthGuard)
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.listPrivateAppointments(user);
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
