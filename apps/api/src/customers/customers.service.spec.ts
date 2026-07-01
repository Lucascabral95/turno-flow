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
  const audit = {
    create: vi.fn().mockResolvedValue({})
  };
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
      audit as never,
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
    const auditCreate = vi.fn().mockResolvedValue({});
    const transaction = {
      customer: { findFirst: customerFindFirst },
      customerNote: { create: customerNoteCreate }
    };
    const service = new CustomersService(
      { create: auditCreate } as never,
      { requireCurrentBusiness } as never,
      {
        $transaction: vi.fn((fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction))
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
    expect(auditCreate).toHaveBeenCalledWith(transaction, expect.objectContaining({
      action: "customer.note_created",
      businessId: "business-1",
      entity: "customer",
      entityId: "customer-1",
      user
    }));
    expect(result).toMatchObject({
      author: { email: "owner@example.test", id: "user-1", name: "Owner" },
      content: "Llamar antes del turno"
    });
  });

  it("rejects empty internal notes", async () => {
    const service = new CustomersService(
      audit as never,
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
      audit as never,
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

  it("imports valid CSV rows, updating existing emails and creating new ones", async () => {
    const requireCurrentBusiness = vi.fn().mockResolvedValue(business);
    const customerFindMany = vi.fn().mockResolvedValue([{ email: "existing@example.test" }]);
    const customerUpsert = vi.fn().mockResolvedValue({});
    const transaction = { customer: { upsert: customerUpsert } };
    const service = new CustomersService(
      audit as never,
      { requireCurrentBusiness } as never,
      {
        $transaction: vi.fn((fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction)),
        customer: { findMany: customerFindMany }
      } as never
    );
    const csv = Buffer.from(
      "name,email,phone\nExisting Customer,Existing@example.test,1122334455\nNew Customer,new@example.test,\n"
    );

    const result = await service.importCsv(user, { buffer: csv } as never);

    expect(customerFindMany).toHaveBeenCalledWith({
      select: { email: true },
      where: { businessId: "business-1", email: { in: ["existing@example.test", "new@example.test"] } }
    });
    expect(customerUpsert).toHaveBeenCalledTimes(2);
    expect(customerUpsert).toHaveBeenCalledWith({
      create: { businessId: "business-1", email: "existing@example.test", name: "Existing Customer", phone: "1122334455" },
      update: { name: "Existing Customer", phone: "1122334455" },
      where: { businessId_email: { businessId: "business-1", email: "existing@example.test" } }
    });
    expect(customerUpsert).toHaveBeenCalledWith({
      create: { businessId: "business-1", email: "new@example.test", name: "New Customer", phone: null },
      update: { name: "New Customer" },
      where: { businessId_email: { businessId: "business-1", email: "new@example.test" } }
    });
    expect(result).toEqual({ errors: [], imported: 1, updated: 1 });
  });

  it("collects per-row errors for invalid CSV data without failing the whole import", async () => {
    const requireCurrentBusiness = vi.fn().mockResolvedValue(business);
    const customerFindMany = vi.fn().mockResolvedValue([]);
    const customerUpsert = vi.fn().mockResolvedValue({});
    const transaction = { customer: { upsert: customerUpsert } };
    const service = new CustomersService(
      audit as never,
      { requireCurrentBusiness } as never,
      {
        $transaction: vi.fn((fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction)),
        customer: { findMany: customerFindMany }
      } as never
    );
    const csv = Buffer.from("name,email,phone\n,missing-name@example.test,\nAna,not-an-email,\nBeto,beto@example.test,\n");

    const result = await service.importCsv(user, { buffer: csv } as never);

    expect(result.errors).toEqual([
      { email: "missing-name@example.test", message: "Invalid name", row: 2 },
      { email: "not-an-email", message: "Invalid email", row: 3 }
    ]);
    expect(result.imported).toBe(1);
    expect(customerUpsert).toHaveBeenCalledTimes(1);
  });

  it("deduplicates repeated emails within the same CSV, keeping the last occurrence", async () => {
    const requireCurrentBusiness = vi.fn().mockResolvedValue(business);
    const customerFindMany = vi.fn().mockResolvedValue([]);
    const customerUpsert = vi.fn().mockResolvedValue({});
    const transaction = { customer: { upsert: customerUpsert } };
    const service = new CustomersService(
      audit as never,
      { requireCurrentBusiness } as never,
      {
        $transaction: vi.fn((fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction)),
        customer: { findMany: customerFindMany }
      } as never
    );
    const csv = Buffer.from("name,email,phone\nAna Old,dup@example.test,\nAna New,dup@example.test,\n");

    const result = await service.importCsv(user, { buffer: csv } as never);

    expect(customerUpsert).toHaveBeenCalledTimes(1);
    expect(customerUpsert).toHaveBeenCalledWith({
      create: { businessId: "business-1", email: "dup@example.test", name: "Ana New", phone: null },
      update: { name: "Ana New" },
      where: { businessId_email: { businessId: "business-1", email: "dup@example.test" } }
    });
    expect(result).toEqual({ errors: [], imported: 1, updated: 0 });
  });

  it("rejects an import with no file", async () => {
    const service = new CustomersService(
      audit as never,
      { requireCurrentBusiness: vi.fn().mockResolvedValue(business) } as never,
      {} as never
    );

    await expect(service.importCsv(user, undefined)).rejects.toThrow("CSV file is required");
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
