import { describe, expect, it } from "vitest";

import type { DashboardMetrics } from "./api";
import {
  buildRecurringCustomerBars,
  buildTopServiceBars,
  buildWeeklyChartBars,
  riskTone
} from "./dashboard-metrics";

describe("dashboard metric helpers", () => {
  it("builds normalized weekly chart bars", () => {
    const bars = buildWeeklyChartBars(makeMetrics());

    expect(bars).toHaveLength(2);
    expect(bars[0]?.date).toBe("2026-06-18");
    expect(typeof bars[0]?.label).toBe("string");
    expect(bars[0]?.totalAppointments).toBe(2);
    expect(bars[0]?.height).toBeLessThan(bars[1]?.height ?? 0);
    expect(bars[1]?.height).toBe(100);
  });

  it("builds ranked bars for services and recurring customers", () => {
    const metrics = makeMetrics();

    expect(buildTopServiceBars(metrics)).toEqual([
      { label: "Corte", value: 4, width: 100 },
      { label: "Barba", value: 2, width: 50 }
    ]);
    expect(buildRecurringCustomerBars(metrics)).toEqual([
      { label: "Ana", value: 3, width: 100 },
      { label: "Bruno", value: 2, width: 67 }
    ]);
  });

  it("maps risk levels to badge tones", () => {
    expect(riskTone("high")).toBe("danger");
    expect(riskTone("medium")).toBe("warning");
    expect(riskTone("low")).toBeUndefined();
  });
});

function makeMetrics(): DashboardMetrics {
  return {
    activeAppointments: 1,
    cancelledAppointments: 1,
    completedAppointments: 4,
    estimatedRevenueCents: 520000,
    lostRevenueCents: 120000,
    noShowAppointments: 1,
    noShowRate: 0.2,
    recurringCustomers: [
      {
        appointments: 3,
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
    ],
    riskyCustomers: [
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
        totalAppointments: 5
      }
    ],
    topServices: [
      {
        bookings: 4,
        name: "Corte",
        serviceId: "service-1"
      },
      {
        bookings: 2,
        name: "Barba",
        serviceId: "service-2"
      }
    ],
    totalAppointments: 6,
    weeklyBreakdown: [
      {
        activeAppointments: 0,
        cancelledAppointments: 0,
        completedAppointments: 1,
        date: "2026-06-18",
        estimatedRevenueCents: 120000,
        lostRevenueCents: 0,
        noShowAppointments: 0,
        totalAppointments: 2
      },
      {
        activeAppointments: 1,
        cancelledAppointments: 0,
        completedAppointments: 3,
        date: "2026-06-19",
        estimatedRevenueCents: 400000,
        lostRevenueCents: 120000,
        noShowAppointments: 1,
        totalAppointments: 5
      }
    ]
  };
}
