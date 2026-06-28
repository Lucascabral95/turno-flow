import { AppointmentStatus, CustomerRiskLevel } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { CustomersService } from "./customers.service";

type CustomerFindManyInput = {
  where?: {
    businessId?: string;
    riskLevel?: CustomerRiskLevel;
  };
};

describe("CustomersService", () => {
  const business = { id: "business-1" };
  const user = { email: "owner@example.test", id: "user-1" };

  it("lists customers with filters and calculated business metrics", async () => {
    const requireCurrentBusiness = vi.fn().mockResolvedValue(business);
    const customerFindMany = vi.fn<(input: CustomerFindManyInput) => Promise<unknown[]>>().mockResolvedValue([
      buildCustomer({
        appointments: [
          buildAppointment({
            service: buildService({ id: "service-1", name: "Corte", priceCents: 120000 }),
            status: AppointmentStatus.COMPLETED
          }),
          buildAppointment({
            service: buildService({ id: "service-1", name: "Corte", priceCents: 120000 }),
            startsAt: new Date("2026-06-20T15:00:00.000Z"),
            status: AppointmentStatus.NO_SHOW
          }),
          buildAppointment({
            service: buildService({ id: "service-2", name: "Barba", priceCents: 80000 }),
            startsAt: new Date("2026-06-21T15:00:00.000Z"),
            status: AppointmentStatus.CONFIRMED
          })
        ],
        completedAppointments: 1,
        noShowCount: 1,
        notes: [buildNote({ content: "Prefiere la mañana" })],
        riskLevel: CustomerRiskLevel.HIGH,
        riskScore: 88,
        totalAppointments: 3
      })
    ]);
    const service = new CustomersService(
      { requireCurrentBusiness } as never,
      { customer: { findMany: customerFindMany } } as never
    );

    const result = await service.list(user, {
      page: 1,
      pageSize: 10,
      query: "ana",
      recurrence: "recurring",
      riskLevel: "high",
      sort: "risk_desc"
    });

    const findManyInput = customerFindMany.mock.calls[0]?.[0];
    expect(findManyInput?.where).toMatchObject({
      businessId: "business-1",
      riskLevel: CustomerRiskLevel.HIGH
    });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      attendanceRate: 33,
      estimatedSpendCents: 120000,
      lastNotePreview: "Prefiere la mañana",
      noShowRate: 33,
      notesCount: 1,
      recurrenceRate: 67,
      riskLevel: "high"
    });
    expect(result.items[0]?.favoriteServices[0]).toEqual({ bookings: 2, name: "Corte", serviceId: "service-1" });
  });

  it("creates a trimmed internal note for the current business customer", async () => {
    const requireCurrentBusiness = vi.fn().mockResolvedValue(business);
    const customerFindFirst = vi.fn().mockResolvedValue({ id: "customer-1" });
    const customerNoteCreate = vi.fn().mockResolvedValue(buildNote({ content: "Llamar antes del turno" }));
    const service = new CustomersService(
      { requireCurrentBusiness } as never,
      {
        customer: { findFirst: customerFindFirst },
        customerNote: { create: customerNoteCreate }
      } as never
    );

    const result = await service.createNote(user, "customer-1", { content: "  Llamar antes del turno  " });

    expect(customerFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { businessId: "business-1", id: "customer-1" }
    });
    expect(customerNoteCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        businessId: "business-1",
        content: "Llamar antes del turno",
        customerId: "customer-1",
        userId: "user-1"
      }
    }));
    expect(result).toMatchObject({
      author: { email: "owner@example.test", id: "user-1", name: "Owner" },
      content: "Llamar antes del turno"
    });
  });

  it("rejects empty internal notes", async () => {
    const service = new CustomersService(
      { requireCurrentBusiness: vi.fn().mockResolvedValue(business) } as never,
      {
        customer: { findFirst: vi.fn().mockResolvedValue({ id: "customer-1" }) },
        customerNote: { create: vi.fn() }
      } as never
    );

    await expect(service.createNote(user, "customer-1", { content: "   " })).rejects.toThrow("Customer note cannot be empty");
  });

  it("does not update customers from another tenant", async () => {
    const customerUpdate = vi.fn();
    const service = new CustomersService(
      { requireCurrentBusiness: vi.fn().mockResolvedValue(business) } as never,
      {
        customer: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: customerUpdate
        }
      } as never
    );

    await expect(service.update(user, "customer-foreign", { name: "Ana" })).rejects.toThrow("Customer not found");
    expect(customerUpdate).not.toHaveBeenCalled();
  });
});

function buildCustomer(overrides: Partial<ReturnType<typeof baseCustomer>> = {}) {
  return {
    ...baseCustomer(),
    ...overrides
  };
}

function baseCustomer() {
  return {
    _count: { notes: 1 },
    appointments: [buildAppointment()],
    completedAppointments: 1,
    email: "ana@example.test",
    id: "customer-1",
    lastRiskCalculatedAt: new Date("2026-06-19T12:00:00.000Z"),
    name: "Ana",
    noShowCount: 0,
    notes: [buildNote()],
    phone: "1122334455",
    requiresDeposit: false,
    riskLevel: CustomerRiskLevel.LOW as CustomerRiskLevel,
    riskScore: 10,
    totalAppointments: 1
  };
}

function buildAppointment(overrides: Partial<ReturnType<typeof baseAppointment>> = {}) {
  return {
    ...baseAppointment(),
    ...overrides
  };
}

function baseAppointment() {
  return {
    cancellationToken: "cancel-token",
    customer: {
      email: "ana@example.test",
      id: "customer-1",
      name: "Ana",
      noShowCount: 0,
      phone: "1122334455"
    },
    endsAt: new Date("2026-06-19T15:30:00.000Z"),
    id: "appointment-1",
    service: buildService(),
    staffMember: {
      active: true,
      email: "staff@example.test",
      id: "staff-1",
      name: "Lucas"
    },
    startsAt: new Date("2026-06-19T15:00:00.000Z"),
    status: AppointmentStatus.COMPLETED as AppointmentStatus
  };
}

function buildService(overrides: Partial<ReturnType<typeof baseService>> = {}) {
  return {
    ...baseService(),
    ...overrides
  };
}

function baseService() {
  return {
    active: true,
    bufferMinutes: 0,
    durationMinutes: 30,
    id: "service-1",
    name: "Corte",
    priceCents: 120000
  };
}

function buildNote(overrides: Partial<ReturnType<typeof baseNote>> = {}) {
  return {
    ...baseNote(),
    ...overrides
  };
}

function baseNote() {
  return {
    content: "Prefiere la mañana",
    createdAt: new Date("2026-06-19T15:00:00.000Z"),
    id: "note-1",
    updatedAt: new Date("2026-06-19T15:00:00.000Z"),
    user: {
      email: "owner@example.test",
      id: "user-1",
      name: "Owner"
    }
  };
}
