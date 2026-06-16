import { dateAtUtcMinutes, minutesSinceMidnight } from "../common/time";

const SLOT_STEP_MINUTES = 15;

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
  busySlots: BusySlotInput[];
}): AvailabilitySlot[] {
  const requiredMinutes = input.durationMinutes + input.bufferMinutes;
  const slots: AvailabilitySlot[] = [];

  for (const rule of input.rules) {
    const ruleStart = minutesSinceMidnight(rule.startTime);
    const ruleEnd = minutesSinceMidnight(rule.endTime);

    for (let start = ruleStart; start + requiredMinutes <= ruleEnd; start += SLOT_STEP_MINUTES) {
      const startsAt = dateAtUtcMinutes(input.date, start);
      const endsAt = dateAtUtcMinutes(input.date, start + requiredMinutes);

      const overlaps = input.busySlots.some((busySlot) => {
        return (
          busySlot.staffMemberId === rule.staffMemberId &&
          startsAt < busySlot.endsAt &&
          endsAt > busySlot.startsAt
        );
      });

      if (!overlaps) {
        slots.push({ endsAt, staffMemberId: rule.staffMemberId, startsAt });
      }
    }
  }

  return slots.sort((left, right) => {
    if (left.startsAt.getTime() !== right.startsAt.getTime()) {
      return left.startsAt.getTime() - right.startsAt.getTime();
    }

    return left.staffMemberId.localeCompare(right.staffMemberId);
  });
}
