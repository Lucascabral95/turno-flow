import { Injectable } from "@nestjs/common";
import { AppointmentStatus } from "@prisma/client";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { BusinessesService } from "../businesses/businesses.service";
import { PrismaService } from "../prisma/prisma.service";
import { fromPrismaAppointmentStatus } from "../appointments/status";

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

  async getNotifications(user: AuthenticatedUser) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const logs = await this.prisma.notificationLog.findMany({
      include: {
        appointment: {
          include: {
            customer: true,
            service: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 25,
      where: { businessId: business.id }
    });

    return logs.map((log) => ({
      appointment: log.appointment
        ? {
            id: log.appointment.id,
            startsAt: log.appointment.startsAt.toISOString(),
            status: fromPrismaAppointmentStatus(log.appointment.status),
            customer: {
              id: log.appointment.customer.id,
              name: log.appointment.customer.name
            },
            service: {
              id: log.appointment.service.id,
              name: log.appointment.service.name
            }
          }
        : null,
      attempts: log.attempts,
      createdAt: log.createdAt.toISOString(),
      email: log.email,
      id: log.id,
      lastError: log.lastError,
      sentAt: log.sentAt?.toISOString() ?? null,
      status: log.status.toLowerCase(),
      template: log.template
    }));
  }
}
