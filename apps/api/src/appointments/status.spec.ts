import { AppointmentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { fromPrismaAppointmentStatus, toPrismaAppointmentStatus } from "./status";

describe("appointment status mapping", () => {
  it("maps public status names to Prisma enum values", () => {
    expect(toPrismaAppointmentStatus("no_show")).toBe(AppointmentStatus.NO_SHOW);
    expect(toPrismaAppointmentStatus("cancelled_by_customer")).toBe(AppointmentStatus.CANCELLED_BY_CUSTOMER);
  });

  it("maps Prisma enum values to public status names", () => {
    expect(fromPrismaAppointmentStatus(AppointmentStatus.CONFIRMED)).toBe("confirmed");
    expect(fromPrismaAppointmentStatus(AppointmentStatus.CANCELLED_BY_BUSINESS)).toBe("cancelled_by_business");
  });
});
