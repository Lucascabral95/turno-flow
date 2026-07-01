import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "node:crypto";

import { AppointmentsService } from "../appointments/appointments.service";
import { createPublicToken } from "../common/tokens";
import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedCustomer } from "./authenticated-customer";
import type { RebookAppointmentDto } from "./dto/customer-portal.dto";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL = "30d";

@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService
  ) {}

  async requestLoginLink(businessSlug: string, email: string): Promise<{ sent: true }> {
    const business = await this.prisma.business.findUnique({
      select: { id: true, name: true, slug: true },
      where: { slug: businessSlug }
    });

    if (!business) {
      return { sent: true };
    }

    const customer = await this.prisma.customer.findUnique({
      where: { businessId_email: { businessId: business.id, email: email.toLowerCase() } }
    });

    if (!customer) {
      return { sent: true };
    }

    const token = createPublicToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      await tx.customerPortalLoginToken.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          expiresAt,
          tokenHash
        }
      });

      await this.outbox.create(tx, {
        aggregateId: customer.id,
        businessId: business.id,
        payload: {
          businessId: business.id,
          businessName: business.name,
          businessSlug: business.slug,
          customerEmail: customer.email,
          customerId: customer.id,
          customerName: customer.name,
          token
        },
        routingKey: EventRoutingKeys.CustomerPortalLoginRequested,
        type: EventTypes.CustomerPortalLoginRequested,
        version: 1
      });
    });

    return { sent: true };
  }

  async exchangeLoginToken(token: string): Promise<{ accessToken: string }> {
    const tokenHash = this.hashToken(token);
    const loginToken = await this.prisma.customerPortalLoginToken.findUnique({
      where: { tokenHash }
    });

    if (!loginToken || loginToken.consumedAt || loginToken.expiresAt <= new Date()) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    await this.prisma.customerPortalLoginToken.update({
      data: { consumedAt: new Date() },
      where: { id: loginToken.id }
    });

    const accessToken = await this.jwt.signAsync(
      { businessId: loginToken.businessId, kind: "customer", sub: loginToken.customerId },
      {
        expiresIn: SESSION_TTL,
        secret: this.config.getOrThrow<string>("JWT_SECRET")
      }
    );

    return { accessToken };
  }

  async me(customer: AuthenticatedCustomer) {
    const record = await this.prisma.customer.findFirst({
      select: {
        completedAppointments: true,
        email: true,
        id: true,
        name: true,
        phone: true,
        totalAppointments: true
      },
      where: { businessId: customer.businessId, id: customer.id }
    });

    if (!record) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    return record;
  }

  async listAppointments(customer: AuthenticatedCustomer) {
    return this.appointments.listAppointmentsForCustomer(customer.businessId, customer.id);
  }

  async cancelAppointment(customer: AuthenticatedCustomer, appointmentId: string) {
    return this.appointments.cancelAppointmentForCustomer(customer.businessId, customer.id, appointmentId);
  }

  async rebookAppointment(customer: AuthenticatedCustomer, appointmentId: string, input: RebookAppointmentDto) {
    const original = await this.prisma.appointment.findFirst({
      select: { serviceId: true, staffMemberId: true },
      where: { businessId: customer.businessId, customerId: customer.id, id: appointmentId }
    });

    if (!original) {
      throw new NotFoundException("Appointment not found");
    }

    return this.appointments.bookAppointmentForCustomer(customer.businessId, customer.id, {
      serviceId: original.serviceId,
      staffMemberId: input.staffMemberId ?? original.staffMemberId,
      startsAt: new Date(input.startsAt)
    });
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
