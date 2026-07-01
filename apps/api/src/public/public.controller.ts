import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AppointmentsService } from "../appointments/appointments.service";
import {
  CancelAppointmentDto,
  CreatePublicAppointmentDto,
  CreateWaitlistEntryDto,
  RescheduleAppointmentDto
} from "../appointments/dto/appointment.dto";
import { CustomersService } from "../customers/customers.service";
import { SubmitReviewDto } from "../reviews/dto/review.dto";
import { ReviewsService } from "../reviews/reviews.service";

@ApiTags("public")
@Controller("public")
export class PublicController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly customers: CustomersService,
    private readonly reviews: ReviewsService
  ) {}

  @Get("businesses/:slug")
  getBusiness(@Param("slug") slug: string) {
    return this.appointments.getPublicBusiness(slug);
  }

  @Get("businesses/:slug/services")
  listServices(@Param("slug") slug: string) {
    return this.appointments.listPublicServices(slug);
  }

  @Get("businesses/:slug/reviews")
  listPublicReviews(@Param("slug") slug: string) {
    return this.reviews.listPublicReviewsByBusiness(slug);
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

  @Get("appointments/:id")
  getAppointment(@Param("id", ParseUUIDPipe) id: string, @Query("token") token: string) {
    return this.appointments.getPublicAppointment(id, { token });
  }

  @Get("appointments/:id/reschedule-slots")
  getAppointmentRescheduleSlots(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("token") token: string,
    @Query("date") date: string
  ) {
    return this.appointments.getPublicRescheduleSlots(id, { token }, date);
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

  @Get("reviews/:token")
  getReview(@Param("token") token: string) {
    return this.reviews.getByToken(token);
  }

  @Post("reviews/:token")
  submitReview(@Param("token") token: string, @Body() input: SubmitReviewDto) {
    return this.reviews.submit(token, input);
  }

  @Post("unsubscribe/:token")
  unsubscribe(@Param("token") token: string) {
    return this.customers.unsubscribeFromMarketing(token);
  }
}
