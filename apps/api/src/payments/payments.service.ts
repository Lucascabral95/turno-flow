import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentPaymentStatus, AppointmentPaymentType, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { BusinessesService } from "../businesses/businesses.service";
import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateManualPaymentDto, PaymentDecisionDto } from "./dto/payment.dto";

type PaymentWithRelations = Prisma.AppointmentPaymentGetPayload<{
  include: {
    appointment: {
      include: {
        customer: true;
        service: true;
        staffMember: true;
      };
    };
    customer: true;
  };
}>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly audit: AuditService,
    private readonly businesses: BusinessesService,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService
  ) {}

  async listAppointmentPayments(user: AuthenticatedUser, appointmentId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireAppointment(business.id, appointmentId);

    const payments = await this.prisma.appointmentPayment.findMany({
      include: {
        appointment: {
          include: { customer: true, service: true, staffMember: true }
        },
        customer: true
      },
      orderBy: { submittedAt: "desc" },
      where: { appointmentId, businessId: business.id }
    });

    return payments.map((payment) => this.serializePayment(payment));
  }

  async createManualPayment(user: AuthenticatedUser, appointmentId: string, input: CreateManualPaymentDto) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const appointment = await this.requireAppointment(business.id, appointmentId);
    this.assertValidAmount(input.amountCents, appointment.service.priceCents);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.appointmentPayment.create({
        data: {
          amountCents: input.amountCents,
          appointmentId: appointment.id,
          businessId: business.id,
          customerId: appointment.customerId,
          customerNote: this.optionalTrim(input.customerNote),
          internalNote: this.optionalTrim(input.internalNote),
          reference: this.optionalTrim(input.reference),
          type: AppointmentPaymentType.DEPOSIT
        },
        include: {
          appointment: {
            include: { customer: true, service: true, staffMember: true }
          },
          customer: true
        }
      });

      await this.audit.create(tx, {
        action: "appointment_payment.submitted",
        after: this.paymentAuditPayload(payment),
        businessId: business.id,
        entity: "appointment_payment",
        entityId: payment.id,
        user
      });

      await this.outbox.create(tx, {
        aggregateId: payment.id,
        businessId: business.id,
        payload: this.paymentEventPayload(payment),
        routingKey: EventRoutingKeys.AppointmentDepositSubmitted,
        type: EventTypes.AppointmentDepositSubmitted,
        version: 1
      });

      return this.serializePayment(payment);
    });
  }

  async confirmPayment(user: AuthenticatedUser, paymentId: string, input: PaymentDecisionDto) {
    return this.transitionPayment(user, paymentId, AppointmentPaymentStatus.CONFIRMED, input);
  }

  async rejectPayment(user: AuthenticatedUser, paymentId: string, input: PaymentDecisionDto) {
    return this.transitionPayment(user, paymentId, AppointmentPaymentStatus.REJECTED, input);
  }

  async voidPayment(user: AuthenticatedUser, paymentId: string, input: PaymentDecisionDto) {
    return this.transitionPayment(user, paymentId, AppointmentPaymentStatus.VOIDED, input);
  }

  private async transitionPayment(
    user: AuthenticatedUser,
    paymentId: string,
    nextStatus: AppointmentPaymentStatus,
    input: PaymentDecisionDto
  ) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const before = await this.prisma.appointmentPayment.findFirst({
      include: {
        appointment: {
          include: { customer: true, service: true, staffMember: true }
        },
        customer: true
      },
      where: { businessId: business.id, id: paymentId }
    });

    if (!before) {
      throw new NotFoundException("Payment not found");
    }

    if (before.status === AppointmentPaymentStatus.VOIDED || before.status === AppointmentPaymentStatus.REJECTED) {
      throw new ConflictException("Payment is already closed");
    }

    if (before.status === nextStatus) {
      return this.serializePayment(before);
    }

    const now = new Date();
    const data = this.transitionData(nextStatus, user.id, now, input.note);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointmentPayment.update({
        data,
        include: {
          appointment: {
            include: { customer: true, service: true, staffMember: true }
          },
          customer: true
        },
        where: { id: paymentId }
      });

      await this.audit.create(tx, {
        action: `appointment_payment.${nextStatus.toLowerCase()}`,
        after: this.paymentAuditPayload(updated),
        before: this.paymentAuditPayload(before),
        businessId: business.id,
        entity: "appointment_payment",
        entityId: updated.id,
        user
      });

      await this.outbox.create(tx, {
        aggregateId: updated.id,
        businessId: business.id,
        payload: this.paymentEventPayload(updated),
        routingKey: this.paymentRoutingKey(nextStatus),
        type: this.paymentEventType(nextStatus),
        version: 1
      });

      return this.serializePayment(updated);
    });
  }

  private transitionData(
    status: AppointmentPaymentStatus,
    userId: string,
    timestamp: Date,
    note: string | undefined
  ): Prisma.AppointmentPaymentUpdateInput {
    const internalNote = this.optionalTrim(note);

    if (status === AppointmentPaymentStatus.CONFIRMED) {
      return {
        confirmedAt: timestamp,
        confirmedByUserId: userId,
        internalNote,
        status
      };
    }

    if (status === AppointmentPaymentStatus.REJECTED) {
      return {
        internalNote,
        rejectedAt: timestamp,
        rejectedByUserId: userId,
        status
      };
    }

    return {
      internalNote,
      status,
      voidedAt: timestamp,
      voidedByUserId: userId
    };
  }

  private async requireAppointment(businessId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      include: { customer: true, service: true, staffMember: true },
      where: { businessId, id: appointmentId }
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    return appointment;
  }

  private assertValidAmount(amountCents: number, servicePriceCents: number): void {
    if (amountCents <= 0) {
      throw new ConflictException("Payment amount must be greater than zero");
    }

    if (servicePriceCents > 0 && amountCents > servicePriceCents) {
      throw new ConflictException("Deposit cannot be greater than the service price");
    }
  }

  private serializePayment(payment: PaymentWithRelations) {
    const remainingBalanceCents = this.remainingBalanceCents(payment.appointment.service.priceCents, payment);

    return {
      amountCents: payment.amountCents,
      appointmentId: payment.appointmentId,
      confirmedAt: payment.confirmedAt,
      createdAt: payment.createdAt,
      currency: payment.currency,
      customerId: payment.customerId,
      customerNote: payment.customerNote,
      id: payment.id,
      internalNote: payment.internalNote,
      reference: payment.reference,
      rejectedAt: payment.rejectedAt,
      remainingBalanceCents,
      servicePriceCents: payment.appointment.service.priceCents,
      status: payment.status.toLowerCase(),
      submittedAt: payment.submittedAt,
      type: payment.type.toLowerCase(),
      voidedAt: payment.voidedAt
    };
  }

  private paymentAuditPayload(payment: PaymentWithRelations): Prisma.InputJsonObject {
    return {
      amountCents: payment.amountCents,
      appointmentId: payment.appointmentId,
      customerId: payment.customerId,
      id: payment.id,
      reference: payment.reference,
      remainingBalanceCents: this.remainingBalanceCents(payment.appointment.service.priceCents, payment),
      servicePriceCents: payment.appointment.service.priceCents,
      status: payment.status.toLowerCase(),
      type: payment.type.toLowerCase()
    };
  }

  private paymentEventPayload(payment: PaymentWithRelations): Prisma.InputJsonObject {
    return {
      amountCents: payment.amountCents,
      appointmentId: payment.appointmentId,
      businessId: payment.businessId,
      customer: {
        email: payment.customer.email,
        id: payment.customer.id,
        name: payment.customer.name
      },
      paymentId: payment.id,
      reference: payment.reference,
      remainingBalanceCents: this.remainingBalanceCents(payment.appointment.service.priceCents, payment),
      service: {
        id: payment.appointment.service.id,
        name: payment.appointment.service.name,
        priceCents: payment.appointment.service.priceCents
      },
      status: payment.status.toLowerCase(),
      type: payment.type.toLowerCase()
    };
  }

  private remainingBalanceCents(servicePriceCents: number, payment: PaymentWithRelations): number {
    if (payment.status !== AppointmentPaymentStatus.CONFIRMED) {
      return servicePriceCents;
    }

    return Math.max(0, servicePriceCents - payment.amountCents);
  }

  private paymentEventType(status: AppointmentPaymentStatus) {
    if (status === AppointmentPaymentStatus.CONFIRMED) {
      return EventTypes.AppointmentDepositConfirmed;
    }

    if (status === AppointmentPaymentStatus.REJECTED) {
      return EventTypes.AppointmentDepositRejected;
    }

    return EventTypes.AppointmentDepositVoided;
  }

  private paymentRoutingKey(status: AppointmentPaymentStatus) {
    if (status === AppointmentPaymentStatus.CONFIRMED) {
      return EventRoutingKeys.AppointmentDepositConfirmed;
    }

    if (status === AppointmentPaymentStatus.REJECTED) {
      return EventRoutingKeys.AppointmentDepositRejected;
    }

    return EventRoutingKeys.AppointmentDepositVoided;
  }

  private optionalTrim(value: string | undefined | null): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
