import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import { AppointmentsService } from "../appointments/appointments.service";
import {
  CancelAppointmentDto,
  CreatePublicAppointmentDto,
  CreateWaitlistEntryDto,
  RescheduleAppointmentDto
} from "../appointments/dto/appointment.dto";

@Controller("public")
export class PublicController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get("businesses/:slug")
  getBusiness(@Param("slug") slug: string) {
    return this.appointments.getPublicBusiness(slug);
  }

  @Get("businesses/:slug/services")
  listServices(@Param("slug") slug: string) {
    return this.appointments.listPublicServices(slug);
  }

  @Get("businesses/:slug/availability")
  getAvailability(@Param("slug") slug: string, @Query("serviceId", ParseUUIDPipe) serviceId: string, @Query("date") date: string) {
    return this.appointments.getAvailability(slug, serviceId, date);
  }

  @Get("businesses/:slug/slots")
  getSlots(@Param("slug") slug: string, @Query("serviceId", ParseUUIDPipe) serviceId: string, @Query("date") date: string) {
    return this.appointments.getAvailability(slug, serviceId, date);
  }

  @Post("businesses/:slug/appointments")
  createAppointment(@Param("slug") slug: string, @Body() input: CreatePublicAppointmentDto) {
    return this.appointments.createPublicAppointment(slug, input);
  }

  @Post("appointments/:id/cancel")
  cancelAppointment(@Param("id", ParseUUIDPipe) id: string, @Body() input: CancelAppointmentDto) {
    return this.appointments.cancelPublicAppointment(id, input);
  }

  @Post("appointments/:id/reschedule")
  rescheduleAppointment(@Param("id", ParseUUIDPipe) id: string, @Body() input: RescheduleAppointmentDto) {
    return this.appointments.reschedulePublicAppointment(id, input);
  }

  @Post("businesses/:slug/waitlist")
  createWaitlistEntry(@Param("slug") slug: string, @Body() input: CreateWaitlistEntryDto) {
    return this.appointments.createWaitlistEntry(slug, input);
  }

  @Post("waitlist-offers/:token/accept")
  acceptWaitlistOffer(@Param("token") token: string) {
    return this.appointments.acceptWaitlistOffer(token);
  }

  @Post("waitlist-offers/:token/reject")
  rejectWaitlistOffer(@Param("token") token: string) {
    return this.appointments.rejectWaitlistOffer(token);
  }
}
