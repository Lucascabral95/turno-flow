import { Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus } from "@prisma/client";

import { BusinessesService } from "../businesses/businesses.service";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly prisma: PrismaService
  ) {}

  async list(user: AuthenticatedUser) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const customers = await this.prisma.customer.findMany({
      include: {
        appointments: {
          include: { service: true },
          orderBy: { startsAt: "desc" }
        }
      },
      orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
      where: { businessId: business.id }
    });

    return customers.map((customer) => this.serializeCustomer(customer));
  }

  async get(user: AuthenticatedUser, customerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const customer = await this.prisma.customer.findFirst({
      include: {
        appointments: {
          include: { service: true, staffMember: true },
          orderBy: { startsAt: "desc" }
        },
        waitlistEntries: {
          include: {
            offers: {
              orderBy: { createdAt: "desc" },
              take: 5
            },
            service: true
          },
          orderBy: { createdAt: "desc" }
        }
      },
      where: { businessId: business.id, id: customerId }
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return this.serializeCustomer(customer);
  }

  async listAppointments(user: AuthenticatedUser, customerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireCustomer(business.id, customerId);

    return this.prisma.appointment.findMany({
      include: { customer: true, service: true, staffMember: true },
      orderBy: { startsAt: "desc" },
      where: { businessId: business.id, customerId }
    });
  }

  async listWaitlist(user: AuthenticatedUser, customerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireCustomer(business.id, customerId);

    return this.prisma.waitlistEntry.findMany({
      include: {
        offers: {
          orderBy: { createdAt: "desc" }
        },
        service: true
      },
      orderBy: { createdAt: "desc" },
      where: { businessId: business.id, customerId }
    });
  }

  private async requireCustomer(businessId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      select: { id: true },
      where: { businessId, id: customerId }
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private serializeCustomer(customer: {
    appointments: Array<{
      priceSnapshotCents?: never;
      service: { priceCents: number };
      startsAt: Date;
      status: AppointmentStatus;
    }>;
    completedAppointments: number;
    email: string;
    id: string;
    lastRiskCalculatedAt: Date | null;
    name: string;
    noShowCount: number;
    phone: string | null;
    requiresDeposit: boolean;
    riskLevel: { toLowerCase(): string };
    riskScore: number;
    totalAppointments: number;
    waitlistEntries?: unknown[];
  }) {
    const completedAppointments = customer.appointments.filter((appointment) => appointment.status === AppointmentStatus.COMPLETED);
    const activeStatuses: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
    const activeAppointments = customer.appointments.filter((appointment) => activeStatuses.includes(appointment.status));

    return {
      appointments: customer.appointments,
      completedAppointments: customer.completedAppointments,
      email: customer.email,
      estimatedSpendCents: completedAppointments.reduce((total, appointment) => total + appointment.service.priceCents, 0),
      id: customer.id,
      lastAppointmentAt: customer.appointments[0]?.startsAt.toISOString() ?? null,
      lastRiskCalculatedAt: customer.lastRiskCalculatedAt?.toISOString() ?? null,
      name: customer.name,
      nextAppointmentAt: activeAppointments
        .filter((appointment) => appointment.startsAt > new Date())
        .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0]?.startsAt.toISOString() ?? null,
      noShowCount: customer.noShowCount,
      phone: customer.phone,
      recurrenceRate: customer.totalAppointments > 1 ? Math.round((customer.completedAppointments / customer.totalAppointments) * 100) : 0,
      requiresDeposit: customer.requiresDeposit,
      riskLevel: customer.riskLevel.toLowerCase(),
      riskScore: customer.riskScore,
      totalAppointments: customer.totalAppointments,
      waitlistEntries: customer.waitlistEntries ?? []
    };
  }
}
