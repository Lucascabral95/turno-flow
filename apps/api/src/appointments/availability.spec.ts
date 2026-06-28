import { describe, expect, it } from "vitest";

import { calculateAvailability } from "./availability";

const referenceNow = new Date("2026-06-15T12:00:00.000Z");

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
      now: referenceNow,
      rules: [
        {
          endTime: "10:30",
          staffMemberId: "staff-1",
          startTime: "09:00"
        }
      ]
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
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
      now: referenceNow,
      rules: [
        {
          endTime: "10:00",
          staffMemberId: "staff-1",
          startTime: "09:00"
        }
      ]
    });

    expect(slots).toHaveLength(1);
    expect(slots[0]?.endsAt.toISOString()).toBe("2026-06-16T09:45:00.000Z");
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
      now: referenceNow,
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
      now: referenceNow,
      rules: []
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-06-16T11:00:00.000Z",
      "2026-06-16T11:30:00.000Z"
    ]);
  });

  it("generates slots in the business timezone", () => {
    const slots = calculateAvailability({
      activeStaffMemberIds: ["staff-1"],
      bufferMinutes: 0,
      busySlots: [],
      date: "2026-06-16",
      durationMinutes: 30,
      exceptions: [],
      now: referenceNow,
      rules: [
        {
          endTime: "10:00",
          staffMemberId: "staff-1",
          startTime: "09:00"
        }
      ],
      timezone: "America/Argentina/Buenos_Aires"
    });

    expect(slots[0]?.startsAt.toISOString()).toBe("2026-06-16T12:00:00.000Z");
    expect(slots[0]?.endsAt.toISOString()).toBe("2026-06-16T12:30:00.000Z");
  });

  it("does not return slots before the current time for the selected business day", () => {
    const slots = calculateAvailability({
      activeStaffMemberIds: ["staff-1"],
      bufferMinutes: 0,
      busySlots: [],
      date: "2026-06-16",
      durationMinutes: 30,
      exceptions: [],
      now: new Date("2026-06-16T17:00:00.000Z"),
      rules: [
        {
          endTime: "16:00",
          staffMemberId: "staff-1",
          startTime: "13:00"
        }
      ],
      timezone: "America/Argentina/Buenos_Aires"
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-06-16T17:30:00.000Z",
      "2026-06-16T18:00:00.000Z",
      "2026-06-16T18:30:00.000Z"
    ]);
  });

  it("keeps today's free future slots while excluding occupied same-day appointments", () => {
    const slots = calculateAvailability({
      activeStaffMemberIds: ["staff-1"],
      bufferMinutes: 0,
      busySlots: [
        {
          endsAt: new Date("2026-06-28T16:30:00.000Z"),
          staffMemberId: "staff-1",
          startsAt: new Date("2026-06-28T16:00:00.000Z")
        },
        {
          endsAt: new Date("2026-06-28T18:30:00.000Z"),
          staffMemberId: "staff-1",
          startsAt: new Date("2026-06-28T17:30:00.000Z")
        }
      ],
      date: "2026-06-28",
      durationMinutes: 30,
      exceptions: [],
      now: new Date("2026-06-28T14:00:00.000Z"),
      rules: [
        {
          endTime: "16:00",
          staffMemberId: "staff-1",
          startTime: "12:00"
        }
      ],
      timezone: "America/Argentina/Buenos_Aires"
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-06-28T15:00:00.000Z",
      "2026-06-28T15:30:00.000Z",
      "2026-06-28T16:30:00.000Z",
      "2026-06-28T17:00:00.000Z",
      "2026-06-28T18:30:00.000Z"
    ]);
    expect(slots.map((slot) => slot.startsAt.toISOString())).not.toContain("2026-06-28T16:00:00.000Z");
    expect(slots.map((slot) => slot.startsAt.toISOString())).not.toContain("2026-06-28T17:30:00.000Z");
    expect(slots.map((slot) => slot.startsAt.toISOString())).not.toContain("2026-06-28T18:00:00.000Z");
  });

  it("does not return slots for past business dates", () => {
    const slots = calculateAvailability({
      activeStaffMemberIds: ["staff-1"],
      bufferMinutes: 0,
      busySlots: [],
      date: "2026-06-15",
      durationMinutes: 30,
      exceptions: [],
      now: new Date("2026-06-16T12:00:00.000Z"),
      rules: [
        {
          endTime: "10:00",
          staffMemberId: "staff-1",
          startTime: "09:00"
        }
      ],
      timezone: "UTC"
    });

    expect(slots).toEqual([]);
  });
});
