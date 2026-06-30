import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthGuard } from "../auth/auth.guard";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { CurrentUser } from "../common/current-user.decorator";
import { CreateManualPaymentDto, PaymentDecisionDto } from "./dto/payment.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@UseGuards(AuthGuard)
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("appointments/:id/payments")
  listAppointmentPayments(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.payments.listAppointmentPayments(user, id);
  }

  @Post("appointments/:id/payments/manual")
  createManualPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: CreateManualPaymentDto
  ) {
    return this.payments.createManualPayment(user, id, input);
  }

  @Patch("appointment-payments/:id/confirm")
  confirmPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: PaymentDecisionDto
  ) {
    return this.payments.confirmPayment(user, id, input);
  }

  @Patch("appointment-payments/:id/reject")
  rejectPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: PaymentDecisionDto
  ) {
    return this.payments.rejectPayment(user, id, input);
  }

  @Patch("appointment-payments/:id/void")
  voidPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: PaymentDecisionDto
  ) {
    return this.payments.voidPayment(user, id, input);
  }
}
