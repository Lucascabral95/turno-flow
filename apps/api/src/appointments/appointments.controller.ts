import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { AppointmentsService } from "./appointments.service";
import { UpdateAppointmentStatusDto } from "./dto/appointment.dto";

@UseGuards(AuthGuard)
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.listPrivateAppointments(user);
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
