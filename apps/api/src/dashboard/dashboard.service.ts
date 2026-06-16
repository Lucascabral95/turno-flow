import { Injectable } from "@nestjs/common";
import { AppointmentStatus } from "@prisma/client";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { BusinessesService } from "../businesses/businesses.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly prisma: PrismaService
  ) {}

  async getMetrics(user: AuthenticatedUser) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const appointments = await this.prisma.appointment.findMany({
      include: {
        customer: true,
        service: true
      },
      where: { businessId: business.id }
    });

    const noShows = appointments.filter((appointment) => appointment.status === AppointmentStatus.NO_SHOW);
    const cancelled = appointments.filter(
      (appointment) =>
        appointment.status === AppointmentStatus.CANCELLED_BY_BUSINESS ||
        appointment.status === AppointmentStatus.CANCELLED_BY_CUSTOMER
    );
    const lostRevenueCents = noShows.reduce((total, appointment) => total + appointment.service.priceCents, 0);
    const riskyCustomers = appointments
      .map((appointment) => appointment.customer)
      .filter((customer, index, allCustomers) => allCustomers.findIndex((candidate) => candidate.id === customer.id) === index)
      .filter((customer) => customer.noShowCount > 0)
      .sort((left, right) => right.noShowCount - left.noShowCount)
      .slice(0, 5);

    return {
      activeAppointments: appointments.filter(
        (appointment) => appointment.status === AppointmentStatus.CONFIRMED || appointment.status === AppointmentStatus.PENDING
      ).length,
      cancelledAppointments: cancelled.length,
      completedAppointments: appointments.filter((appointment) => appointment.status === AppointmentStatus.COMPLETED).length,
      lostRevenueCents,
      noShowAppointments: noShows.length,
      noShowRate: appointments.length === 0 ? 0 : noShows.length / appointments.length,
      riskyCustomers,
      totalAppointments: appointments.length
    };
  }
}
