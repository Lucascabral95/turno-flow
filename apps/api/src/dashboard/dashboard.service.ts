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
    const monthRange = this.monthRange(new Date());
    const weekRange = this.lastSevenDaysRange(new Date());

    const [monthlyMetrics, weeklyMetrics, monthlyAppointments, riskyCustomers] = await Promise.all([
      this.prisma.businessMetricsDaily.findMany({
        orderBy: { date: "asc" },
        where: {
          businessId: business.id,
          date: {
            gte: monthRange.start,
            lt: monthRange.end
          }
        }
      }),
      this.prisma.businessMetricsDaily.findMany({
        orderBy: { date: "asc" },
        where: {
          businessId: business.id,
          date: {
            gte: weekRange.start,
            lt: weekRange.end
          }
        }
      }),
      this.prisma.appointment.findMany({
        include: {
          customer: true,
          service: true
        },
        where: {
          businessId: business.id,
          startsAt: {
            gte: monthRange.start,
            lt: monthRange.end
          }
        }
      }),
      this.prisma.customer.findMany({
        orderBy: [{ riskScore: "desc" }, { noShowCount: "desc" }],
        take: 5,
        where: {
          businessId: business.id,
          OR: [{ noShowCount: { gt: 0 } }, { riskLevel: { not: "LOW" } }]
        }
      })
    ]);

    const monthlySummary =
      monthlyMetrics.length > 0 ? this.sumDailyMetrics(monthlyMetrics) : this.sumMetricsFromAppointments(monthlyAppointments);

    return {
      activeAppointments: monthlySummary.activeAppointments,
      cancelledAppointments: monthlySummary.cancelledAppointments,
      completedAppointments: monthlySummary.completedAppointments,
      estimatedRevenueCents: monthlySummary.estimatedRevenueCents,
      lostRevenueCents: monthlySummary.lostRevenueCents,
      noShowAppointments: monthlySummary.noShowAppointments,
      noShowRate: monthlySummary.totalAppointments === 0 ? 0 : monthlySummary.noShowAppointments / monthlySummary.totalAppointments,
      recurringCustomers: this.recurringCustomers(monthlyAppointments),
      riskyCustomers: riskyCustomers.map((customer) => ({
        completedAppointments: customer.completedAppointments,
        email: customer.email,
        id: customer.id,
        lastRiskCalculatedAt: customer.lastRiskCalculatedAt?.toISOString() ?? null,
        name: customer.name,
        noShowCount: customer.noShowCount,
        requiresDeposit: customer.requiresDeposit,
        riskLevel: customer.riskLevel.toLowerCase(),
        riskScore: customer.riskScore,
        totalAppointments: customer.totalAppointments
      })),
      topServices: this.topServices(monthlyAppointments),
      totalAppointments: monthlySummary.totalAppointments,
      weeklyBreakdown: this.weeklyBreakdown(weekRange.start, weeklyMetrics)
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

  async getNoShowMetrics(user: AuthenticatedUser) {
    const metrics = await this.getMetrics(user);

    return {
      noShowAppointments: metrics.noShowAppointments,
      noShowRate: metrics.noShowRate,
      riskyCustomers: metrics.riskyCustomers
    };
  }

  async getRevenueLossMetrics(user: AuthenticatedUser) {
    const metrics = await this.getMetrics(user);

    return {
      estimatedRevenueCents: metrics.estimatedRevenueCents,
      lostRevenueCents: metrics.lostRevenueCents
    };
  }

  async getRevenueMetrics(user: AuthenticatedUser) {
    const metrics = await this.getMetrics(user);

    return {
      cancellationRate:
        metrics.totalAppointments > 0 ? metrics.cancelledAppointments / metrics.totalAppointments : 0,
      estimatedRevenueCents: metrics.estimatedRevenueCents,
      lostRevenueCents: metrics.lostRevenueCents,
      noShowRate: metrics.noShowRate,
      totalAppointments: metrics.totalAppointments
    };
  }

  async getServiceMetrics(user: AuthenticatedUser) {
    const metrics = await this.getMetrics(user);

    return {
      topServices: metrics.topServices
    };
  }

  async getCustomerMetrics(user: AuthenticatedUser) {
    const metrics = await this.getMetrics(user);

    return {
      recurringCustomers: metrics.recurringCustomers,
      riskyCustomers: metrics.riskyCustomers
    };
  }

  async getOccupancyMetrics(user: AuthenticatedUser) {
    const metrics = await this.getMetrics(user);

    return {
      activeAppointments: metrics.activeAppointments,
      completedAppointments: metrics.completedAppointments,
      weeklyBreakdown: metrics.weeklyBreakdown
    };
  }

  private sumDailyMetrics(
    metrics: Array<{
      activeAppointments: number;
      cancelledAppointments: number;
      completedAppointments: number;
      estimatedRevenueCents: number;
      lostRevenueCents: number;
      noShowAppointments: number;
      totalAppointments: number;
    }>
  ) {
    return metrics.reduce(
      (summary, day) => ({
        activeAppointments: summary.activeAppointments + day.activeAppointments,
        cancelledAppointments: summary.cancelledAppointments + day.cancelledAppointments,
        completedAppointments: summary.completedAppointments + day.completedAppointments,
        estimatedRevenueCents: summary.estimatedRevenueCents + day.estimatedRevenueCents,
        lostRevenueCents: summary.lostRevenueCents + day.lostRevenueCents,
        noShowAppointments: summary.noShowAppointments + day.noShowAppointments,
        totalAppointments: summary.totalAppointments + day.totalAppointments
      }),
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 0,
        estimatedRevenueCents: 0,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 0
      }
    );
  }

  private sumMetricsFromAppointments(
    appointments: Array<{
      service: { priceCents: number };
      status: AppointmentStatus;
    }>
  ) {
    return appointments.reduce(
      (summary, appointment) => {
        const isCancelled =
          appointment.status === AppointmentStatus.CANCELLED_BY_BUSINESS ||
          appointment.status === AppointmentStatus.CANCELLED_BY_CUSTOMER;
        const isActive =
          appointment.status === AppointmentStatus.CONFIRMED || appointment.status === AppointmentStatus.PENDING;
        const isCompleted = appointment.status === AppointmentStatus.COMPLETED;
        const isNoShow = appointment.status === AppointmentStatus.NO_SHOW;
        const countsRevenue = !isCancelled;

        return {
          activeAppointments: summary.activeAppointments + (isActive ? 1 : 0),
          cancelledAppointments: summary.cancelledAppointments + (isCancelled ? 1 : 0),
          completedAppointments: summary.completedAppointments + (isCompleted ? 1 : 0),
          estimatedRevenueCents: summary.estimatedRevenueCents + (countsRevenue ? appointment.service.priceCents : 0),
          lostRevenueCents: summary.lostRevenueCents + (isNoShow ? appointment.service.priceCents : 0),
          noShowAppointments: summary.noShowAppointments + (isNoShow ? 1 : 0),
          totalAppointments: summary.totalAppointments + 1
        };
      },
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 0,
        estimatedRevenueCents: 0,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 0
      }
    );
  }

  private topServices(
    appointments: Array<{
      service: { id: string; name: string };
      status: AppointmentStatus;
    }>
  ) {
    const counts = new Map<string, { bookings: number; name: string }>();

    for (const appointment of appointments) {
      if (
        appointment.status === AppointmentStatus.CANCELLED_BY_BUSINESS ||
        appointment.status === AppointmentStatus.CANCELLED_BY_CUSTOMER
      ) {
        continue;
      }

      const current = counts.get(appointment.service.id);
      counts.set(appointment.service.id, {
        bookings: (current?.bookings ?? 0) + 1,
        name: appointment.service.name
      });
    }

    return Array.from(counts.entries())
      .map(([serviceId, value]) => ({
        bookings: value.bookings,
        name: value.name,
        serviceId
      }))
      .sort((left, right) => right.bookings - left.bookings || left.name.localeCompare(right.name))
      .slice(0, 5);
  }

  private recurringCustomers(
    appointments: Array<{
      customer: { email: string; id: string; name: string };
      status: AppointmentStatus;
    }>
  ) {
    const counts = new Map<string, { appointments: number; email: string; name: string }>();

    for (const appointment of appointments) {
      if (
        appointment.status === AppointmentStatus.CANCELLED_BY_BUSINESS ||
        appointment.status === AppointmentStatus.CANCELLED_BY_CUSTOMER
      ) {
        continue;
      }

      const current = counts.get(appointment.customer.id);
      counts.set(appointment.customer.id, {
        appointments: (current?.appointments ?? 0) + 1,
        email: appointment.customer.email,
        name: appointment.customer.name
      });
    }

    return Array.from(counts.entries())
      .map(([customerId, value]) => ({
        appointments: value.appointments,
        customerId,
        email: value.email,
        name: value.name
      }))
      .filter((customer) => customer.appointments > 1)
      .sort((left, right) => right.appointments - left.appointments || left.name.localeCompare(right.name))
      .slice(0, 5);
  }

  private weeklyBreakdown(
    startDate: Date,
    metrics: Array<{
      activeAppointments: number;
      cancelledAppointments: number;
      completedAppointments: number;
      date: Date;
      estimatedRevenueCents: number;
      lostRevenueCents: number;
      noShowAppointments: number;
      totalAppointments: number;
    }>
  ) {
    const metricsByDate = new Map(metrics.map((day) => [day.date.toISOString().slice(0, 10), day]));
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setUTCDate(startDate.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const day = metricsByDate.get(key);

      return {
        activeAppointments: day?.activeAppointments ?? 0,
        cancelledAppointments: day?.cancelledAppointments ?? 0,
        completedAppointments: day?.completedAppointments ?? 0,
        date: key,
        estimatedRevenueCents: day?.estimatedRevenueCents ?? 0,
        lostRevenueCents: day?.lostRevenueCents ?? 0,
        noShowAppointments: day?.noShowAppointments ?? 0,
        totalAppointments: day?.totalAppointments ?? 0
      };
    });

    return days;
  }

  private monthRange(now: Date) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return { end, start };
  }

  private lastSevenDaysRange(now: Date) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));

    return { end, start };
  }
}
