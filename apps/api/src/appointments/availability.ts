import { dateAtZonedMinutes, dateOnlyInTimeZone, minutesSinceMidnight } from "../common/time";

const SLOT_STEP_MINUTES = 30;

export type AvailabilityRuleInput = {
  staffMemberId: string;
  startTime: string;
  endTime: string;
};

export type BusySlotInput = {
  staffMemberId: string;
  startsAt: Date;
  endsAt: Date;
};

export type AvailabilityExceptionInput = {
  staffMemberId: string | null;
  startTime: string;
  endTime: string;
  type: "BLOCKED" | "EXTRA_OPENING";
};

export type AvailabilitySlot = {
  staffMemberId: string;
  startsAt: Date;
  endsAt: Date;
};

export function calculateAvailability(input: {
  date: string;
  durationMinutes: number;
  bufferMinutes: number;
  rules: AvailabilityRuleInput[];
  exceptions: AvailabilityExceptionInput[];
  busySlots: BusySlotInput[];
  activeStaffMemberIds: string[];
  timezone?: string;
  now?: Date;
}): AvailabilitySlot[] {
  const requiredMinutes = input.durationMinutes + input.bufferMinutes;
  const timezone = input.timezone ?? "UTC";
  const now = input.now ?? new Date();
  const currentDate = dateOnlyInTimeZone(now, timezone);

  if (input.date < currentDate) {
    return [];
  }

  const slots = new Map<string, AvailabilitySlot>();
  const windows = [
    ...input.rules.map((rule) => ({
      staffMemberId: rule.staffMemberId,
      startTime: rule.startTime,
      endTime: rule.endTime
    })),
    ...input.exceptions
      .filter((exception) => exception.type === "EXTRA_OPENING")
      .flatMap((exception) => {
        const staffMemberIds = exception.staffMemberId ? [exception.staffMemberId] : input.activeStaffMemberIds;

        return staffMemberIds.map((staffMemberId) => ({
          endTime: exception.endTime,
          staffMemberId,
          startTime: exception.startTime
        }));
      })
  ];
  const blockedWindows = input.exceptions.filter((exception) => exception.type === "BLOCKED");

  for (const window of windows) {
    const windowStart = minutesSinceMidnight(window.startTime);
    const windowEnd = minutesSinceMidnight(window.endTime);

    for (let start = windowStart; start + requiredMinutes <= windowEnd; start += SLOT_STEP_MINUTES) {
      const startsAt = dateAtZonedMinutes(input.date, start, timezone);
      const endsAt = dateAtZonedMinutes(input.date, start + requiredMinutes, timezone);

      if (input.date === currentDate && startsAt <= now) {
        continue;
      }

      const overlaps = input.busySlots.some((busySlot) => {
        return (
          busySlot.staffMemberId === window.staffMemberId &&
          startsAt < busySlot.endsAt &&
          endsAt > busySlot.startsAt
        );
      });
      const blocked = blockedWindows.some((blockedWindow) => {
        const appliesToStaff = !blockedWindow.staffMemberId || blockedWindow.staffMemberId === window.staffMemberId;
        if (!appliesToStaff) {
          return false;
        }

        const blockedStart = dateAtZonedMinutes(input.date, minutesSinceMidnight(blockedWindow.startTime), timezone);
        const blockedEnd = dateAtZonedMinutes(input.date, minutesSinceMidnight(blockedWindow.endTime), timezone);

        return startsAt < blockedEnd && endsAt > blockedStart;
      });

      if (!overlaps && !blocked) {
        slots.set(`${window.staffMemberId}-${startsAt.toISOString()}-${endsAt.toISOString()}`, {
          endsAt,
          staffMemberId: window.staffMemberId,
          startsAt
        });
      }
    }
  }

  return [...slots.values()].sort((left, right) => {
    if (left.startsAt.getTime() !== right.startsAt.getTime()) {
      return left.startsAt.getTime() - right.startsAt.getTime();
    }

    return left.staffMemberId.localeCompare(right.staffMemberId);
  });
}
