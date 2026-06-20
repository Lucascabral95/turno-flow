import { describe, expect, it } from "vitest";

import { bookingFormSchema, createLocalDateString, waitlistFormSchema } from "./booking-forms";

describe("bookingFormSchema", () => {
  it("accepts a complete booking payload", () => {
    const result = bookingFormSchema.safeParse({
      customerEmail: "lucas@example.com",
      customerName: "Lucas Barber",
      customerPhone: "+5491155555555",
      date: "2026-06-19",
      serviceId: "svc_1",
      slotKey: "staff_1::2026-06-19T12:00:00.000Z"
    });

    expect(result.success).toBe(true);
  });

  it("requires a phone and selected slot", () => {
    const result = bookingFormSchema.safeParse({
      customerEmail: "lucas@example.com",
      customerName: "L",
      customerPhone: "",
      date: "2026-06-19",
      serviceId: "svc_1",
      slotKey: ""
    });

    expect(result.success).toBe(false);
  });
});

describe("waitlistFormSchema", () => {
  it("rejects an invalid date range", () => {
    const result = waitlistFormSchema.safeParse({
      customerEmail: "lucas@example.com",
      customerName: "Lucas Barber",
      customerPhone: "",
      earliestTime: "18:00",
      latestTime: "09:00",
      preferredDateEnd: "2026-06-18",
      preferredDateStart: "2026-06-19",
      serviceId: "svc_1"
    });

    expect(result.success).toBe(false);
  });
});

describe("createLocalDateString", () => {
  it("formats a date without UTC shifting", () => {
    expect(createLocalDateString(new Date(2026, 5, 19))).toBe("2026-06-19");
  });
});
