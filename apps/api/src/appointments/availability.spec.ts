import { describe, expect, it } from "vitest";

import { calculateAvailability } from "./availability";

describe("calculateAvailability", () => {
  it("generates slots by staff member while excluding busy overlaps", () => {
    const slots = calculateAvailability({
      activeStaffMemberIds: ["staff-1"],
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
      exceptions: [],
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
      activeStaffMemberIds: ["staff-1"],
      bufferMinutes: 15,
      busySlots: [],
      date: "2026-06-16",
      durationMinutes: 30,
      exceptions: [],
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

  it("removes slots that overlap a blocking exception", () => {
    const slots = calculateAvailability({
      activeStaffMemberIds: ["staff-1"],
      bufferMinutes: 0,
      busySlots: [],
      date: "2026-06-16",
      durationMinutes: 30,
      exceptions: [
        {
          endTime: "10:00",
          staffMemberId: "staff-1",
          startTime: "09:30",
          type: "BLOCKED"
        }
      ],
      rules: [
        {
          endTime: "10:30",
          staffMemberId: "staff-1",
          startTime: "09:00"
        }
      ]
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-06-16T09:00:00.000Z",
      "2026-06-16T10:00:00.000Z"
    ]);
  });

  it("adds slots from an extra opening even without a weekly rule", () => {
    const slots = calculateAvailability({
      activeStaffMemberIds: ["staff-1"],
      bufferMinutes: 0,
      busySlots: [],
      date: "2026-06-16",
      durationMinutes: 30,
      exceptions: [
        {
          endTime: "12:00",
          staffMemberId: null,
          startTime: "11:00",
          type: "EXTRA_OPENING"
        }
      ],
      rules: []
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-06-16T11:00:00.000Z",
      "2026-06-16T11:15:00.000Z",
      "2026-06-16T11:30:00.000Z"
    ]);
  });
});
