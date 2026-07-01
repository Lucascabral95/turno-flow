import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import type { AuthenticatedCustomer } from "./authenticated-customer";
import { CurrentCustomer } from "./current-customer.decorator";
import { CustomerAuthGuard } from "./customer-auth.guard";
import { CustomerPortalService } from "./customer-portal.service";
import { ExchangeLoginTokenDto, RebookAppointmentDto, RequestLoginLinkDto } from "./dto/customer-portal.dto";

@ApiTags("customer-portal")
@Controller("customer-portal")
export class CustomerPortalController {
  constructor(private readonly customerPortal: CustomerPortalService) {}

  @Post("login-link")
  requestLoginLink(@Body() input: RequestLoginLinkDto) {
    return this.customerPortal.requestLoginLink(input.businessSlug, input.email);
  }

  @Post("sessions")
  exchangeLoginToken(@Body() input: ExchangeLoginTokenDto) {
    return this.customerPortal.exchangeLoginToken(input.token);
  }

  @UseGuards(CustomerAuthGuard)
  @Get("me")
  me(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerPortal.me(customer);
  }

  @UseGuards(CustomerAuthGuard)
  @Get("appointments")
  listAppointments(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.customerPortal.listAppointments(customer);
  }

  @UseGuards(CustomerAuthGuard)
  @Post("appointments/:id/cancel")
  cancelAppointment(@CurrentCustomer() customer: AuthenticatedCustomer, @Param("id", ParseUUIDPipe) id: string) {
    return this.customerPortal.cancelAppointment(customer, id);
  }

  @UseGuards(CustomerAuthGuard)
  @Post("appointments/:id/rebook")
  rebookAppointment(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RebookAppointmentDto
  ) {
    return this.customerPortal.rebookAppointment(customer, id, input);
  }
}
