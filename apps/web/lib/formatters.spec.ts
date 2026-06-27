import { describe, expect, it } from "vitest";

import { formatSlotTime } from "../shared/utils/formatters";

describe("formatSlotTime", () => {
  it("formats appointment slots in the requested timezone instead of UTC", () => {
    expect(formatSlotTime("2026-06-30T15:00:00.000Z", "America/Argentina/Buenos_Aires")).toContain("12:00");
  });
});
