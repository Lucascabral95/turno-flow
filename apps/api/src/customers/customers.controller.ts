import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { CustomersService } from "./customers.service";

@UseGuards(AuthGuard)
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.customers.list(user);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.get(user, id);
  }

  @Get(":id/appointments")
  listAppointments(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.listAppointments(user, id);
  }

  @Get(":id/waitlist")
  listWaitlist(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.listWaitlist(user, id);
  }
}
