import { AppointmentStatus, NotificationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns monthly metrics from daily aggregates with rankings", async () => {
    const requireCurrentBusiness = vi.fn().mockResolvedValue({ id: "business-1" });
    const businessMetricsFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          activeAppointments: 3,
          cancelledAppointments: 1,
          completedAppointments: 2,
          date: new Date("2026-06-01T00:00:00.000Z"),
          estimatedRevenueCents: 210000,
          lostRevenueCents: 50000,
          noShowAppointments: 1,
          totalAppointments: 6
        },
        {
          activeAppointments: 1,
          cancelledAppointments: 0,
          completedAppointments: 3,
          date: new Date("2026-06-18T00:00:00.000Z"),
          estimatedRevenueCents: 300000,
          lostRevenueCents: 0,
          noShowAppointments: 0,
          totalAppointments: 4
        }
      ])
      .mockResolvedValueOnce([
        {
          activeAppointments: 0,
          cancelledAppointments: 0,
          completedAppointments: 3,
          date: new Date("2026-06-18T00:00:00.000Z"),
          estimatedRevenueCents: 300000,
          lostRevenueCents: 0,
          noShowAppointments: 0,
          totalAppointments: 4
        },
        {
          activeAppointments: 1,
          cancelledAppointments: 0,
          completedAppointments: 0,
          date: new Date("2026-06-19T00:00:00.000Z"),
          estimatedRevenueCents: 90000,
          lostRevenueCents: 0,
          noShowAppointments: 0,
          totalAppointments: 1
        }
      ]);
    const appointmentFindMany = vi.fn().mockResolvedValue([
      {
        customer: {
          email: "ana@example.com",
          id: "customer-1",
          name: "Ana"
        },
        service: { id: "service-1", name: "Corte", priceCents: 120000 },
        status: AppointmentStatus.COMPLETED
      },
      {
        customer: {
          name: "Ana",
          email: "ana@example.com",
          id: "customer-1"
        },
        service: { id: "service-1", name: "Corte", priceCents: 120000 },
        status: AppointmentStatus.NO_SHOW
      },
      {
        customer: {
          email: "bruno@example.com",
          id: "customer-2",
          name: "Bruno",
        },
        service: { id: "service-2", name: "Barba", priceCents: 90000 },
        status: AppointmentStatus.CONFIRMED
      },
      {
        customer: {
          email: "bruno@example.com",
          id: "customer-2",
          name: "Bruno"
        },
        service: { id: "service-2", name: "Barba", priceCents: 90000 },
        status: AppointmentStatus.COMPLETED
      },
      {
        customer: {
          email: "bruno@example.com",
          id: "customer-2",
          name: "Bruno"
        },
        service: { id: "service-3", name: "Color", priceCents: 70000 },
        status: AppointmentStatus.CANCELLED_BY_CUSTOMER
      }
    ]);
    const customerFindMany = vi.fn().mockResolvedValue([
      {
        completedAppointments: 2,
        email: "ana@example.com",
        id: "customer-1",
        lastRiskCalculatedAt: new Date("2026-06-18T12:00:00.000Z"),
        name: "Ana",
        noShowCount: 3,
        requiresDeposit: true,
        riskLevel: "HIGH",
        riskScore: 100,
        totalAppointments: 6
      },
      {
        completedAppointments: 4,
        email: "bruno@example.com",
        id: "customer-2",
        lastRiskCalculatedAt: new Date("2026-06-17T12:00:00.000Z"),
        name: "Bruno",
        noShowCount: 1,
        requiresDeposit: false,
        riskLevel: "MEDIUM",
        riskScore: 38,
        totalAppointments: 5
      }
    ]);
    const service = new DashboardService(
      { requireCurrentBusiness } as never,
      {
        appointment: { findMany: appointmentFindMany },
        businessMetricsDaily: { findMany: businessMetricsFindMany },
        customer: { findMany: customerFindMany }
      } as never
    );

    const result = await service.getMetrics({ id: "user-1" } as never);

    expect(businessMetricsFindMany).toHaveBeenNthCalledWith(1, {
      orderBy: { date: "asc" },
      where: {
        businessId: "business-1",
        date: {
          gte: new Date("2026-06-01T00:00:00.000Z"),
          lt: new Date("2026-07-01T00:00:00.000Z")
        }
      }
    });
    expect(result.activeAppointments).toBe(4);
    expect(result.cancelledAppointments).toBe(1);
    expect(result.completedAppointments).toBe(5);
    expect(result.estimatedRevenueCents).toBe(510000);
    expect(result.lostRevenueCents).toBe(50000);
    expect(result.noShowAppointments).toBe(1);
    expect(result.totalAppointments).toBe(10);
    expect(result.topServices).toEqual([
      { bookings: 2, name: "Barba", serviceId: "service-2" },
      { bookings: 2, name: "Corte", serviceId: "service-1" }
    ]);
    expect(result.recurringCustomers).toEqual([
      {
        appointments: 2,
        customerId: "customer-1",
        email: "ana@example.com",
        name: "Ana"
      },
      {
        appointments: 2,
        customerId: "customer-2",
        email: "bruno@example.com",
        name: "Bruno"
      }
    ]);
    expect(result.riskyCustomers).toEqual([
      {
        completedAppointments: 2,
        email: "ana@example.com",
        id: "customer-1",
        lastRiskCalculatedAt: "2026-06-18T12:00:00.000Z",
        name: "Ana",
        noShowCount: 3,
        requiresDeposit: true,
        riskLevel: "high",
        riskScore: 100,
        totalAppointments: 6
      },
      {
        completedAppointments: 4,
        email: "bruno@example.com",
        id: "customer-2",
        lastRiskCalculatedAt: "2026-06-17T12:00:00.000Z",
        name: "Bruno",
        noShowCount: 1,
        requiresDeposit: false,
        riskLevel: "medium",
        riskScore: 38,
        totalAppointments: 5
      }
    ]);
    expect(result.weeklyBreakdown).toEqual([
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 0,
        date: "2026-06-13",
        estimatedRevenueCents: 0,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 0
      },
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 0,
        date: "2026-06-14",
        estimatedRevenueCents: 0,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 0
      },
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 0,
        date: "2026-06-15",
        estimatedRevenueCents: 0,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 0
      },
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 0,
        date: "2026-06-16",
        estimatedRevenueCents: 0,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 0
      },
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 0,
        date: "2026-06-17",
        estimatedRevenueCents: 0,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 0
      },
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 3,
        date: "2026-06-18",
        estimatedRevenueCents: 300000,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 4
      },
      {
        activeAppointments: 1,
        cancelledAppointments: 0,
        completedAppointments: 0,
        date: "2026-06-19",
        estimatedRevenueCents: 90000,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 1
      }
    ]);
  });

  it("returns recent notification logs scoped to the current business", async () => {
    const requireCurrentBusiness = vi.fn().mockResolvedValue({ id: "business-1" });
    const findMany = vi.fn().mockResolvedValue([
      {
        appointment: {
          customer: {
            id: "customer-1",
            name: "Ana"
          },
          id: "appointment-1",
          service: {
            id: "service-1",
            name: "Corte"
          },
          startsAt: new Date("2026-06-18T15:00:00.000Z"),
          status: AppointmentStatus.CONFIRMED
        },
        attempts: 2,
        createdAt: new Date("2026-06-17T15:00:00.000Z"),
        email: "ana@example.com",
        id: "log-1",
        lastError: null,
        sentAt: new Date("2026-06-17T15:01:00.000Z"),
        status: NotificationStatus.SENT,
        template: "appointment_reminder_24h"
      }
    ]);
    const service = new DashboardService(
      { requireCurrentBusiness } as never,
      { notificationLog: { findMany } } as never
    );

    const result = await service.getNotifications({ id: "user-1" } as never);

    expect(findMany).toHaveBeenCalledWith({
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
      where: { businessId: "business-1" }
    });
    expect(result).toEqual([
      {
        appointment: {
          customer: {
            id: "customer-1",
            name: "Ana"
          },
          id: "appointment-1",
          service: {
            id: "service-1",
            name: "Corte"
          },
          startsAt: "2026-06-18T15:00:00.000Z",
          status: "confirmed"
        },
        attempts: 2,
        createdAt: "2026-06-17T15:00:00.000Z",
        email: "ana@example.com",
        id: "log-1",
        lastError: null,
        sentAt: "2026-06-17T15:01:00.000Z",
        status: "sent",
        template: "appointment_reminder_24h"
      }
    ]);
  });
});
