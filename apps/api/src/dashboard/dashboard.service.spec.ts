import { AppointmentStatus, NotificationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
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
