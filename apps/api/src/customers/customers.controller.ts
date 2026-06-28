import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { CustomersService } from "./customers.service";
import { CreateCustomerNoteDto, ListCustomersQueryDto, UpdateCustomerDto } from "./dto/customer.dto";

@UseGuards(AuthGuard)
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCustomersQueryDto) {
    return this.customers.list(user, query);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.get(user, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() input: UpdateCustomerDto) {
    return this.customers.update(user, id, input);
  }

  @Get(":id/appointments")
  listAppointments(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.listAppointments(user, id);
  }

  @Get(":id/waitlist")
  listWaitlist(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.listWaitlist(user, id);
  }

  @Get(":id/notes")
  listNotes(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.listNotes(user, id);
  }

  @Post(":id/notes")
  createNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CreateCustomerNoteDto
  ) {
    return this.customers.createNote(user, id, input);
  }
}
