import { describe, expect, it } from "vitest";

import { calculateAvailability } from "./availability";

describe("calculateAvailability", () => {
  it("generates slots by staff member while excluding busy overlaps", () => {
    const slots = calculateAvailability({
      bufferMinutes: 0,
      busySlots: [
        {
          endsAt: new Date("2026-06-16T09:45:00.000Z"),
          staffMemberId: "staff-1",
          startsAt: new Date("2026-06-16T09:15:00.000Z")
        }
      ],
      date: "2026-06-16",
      durationMinutes: 30,
      rules: [
        {
          endTime: "10:30",
          staffMemberId: "staff-1",
          startTime: "09:00"
        }
      ]
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-06-16T09:45:00.000Z",
      "2026-06-16T10:00:00.000Z"
    ]);
  });

  it("includes buffer time in slot capacity", () => {
    const slots = calculateAvailability({
      bufferMinutes: 15,
      busySlots: [],
      date: "2026-06-16",
      durationMinutes: 30,
      rules: [
        {
          endTime: "10:00",
          staffMemberId: "staff-1",
          startTime: "09:00"
        }
      ]
    });

    expect(slots).toHaveLength(2);
    expect(slots[0]?.endsAt.toISOString()).toBe("2026-06-16T09:45:00.000Z");
    expect(slots[1]?.endsAt.toISOString()).toBe("2026-06-16T10:00:00.000Z");
  });
});
