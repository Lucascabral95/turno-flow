export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must use YYYY-MM-DD format");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function dateOnlyInTimeZone(value: Date, timeZone: string): string {
  const parts = timeZoneParts(value, timeZone);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function weekdayUtc(value: Date): number {
  return value.getUTCDay();
}

export function minutesSinceMidnight(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    throw new Error("Time must use HH:mm format");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function dateAtUtcMinutes(date: string, minutes: number): Date {
  return dateAtZonedMinutes(date, minutes, "UTC");
}

export function dateAtZonedMinutes(date: string, minutes: number, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must use YYYY-MM-DD format");
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("Date must use YYYY-MM-DD format");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const localAsUtc = Date.UTC(year, month - 1, day, hours, remainingMinutes, 0, 0);
  const firstOffset = timeZoneOffsetMs(new Date(localAsUtc), timeZone);
  const firstUtc = localAsUtc - firstOffset;
  const secondOffset = timeZoneOffsetMs(new Date(firstUtc), timeZone);

  return new Date(localAsUtc - secondOffset);
}

export function zonedDayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  return {
    end: dateAtZonedMinutes(date, 24 * 60, timeZone),
    start: dateAtZonedMinutes(date, 0, timeZone)
  };
}

function timeZoneOffsetMs(value: Date, timeZone: string): number {
  const parts = timeZoneParts(value, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - value.getTime();
}

function timeZoneParts(value: Date, timeZone: string): Record<"day" | "hour" | "minute" | "month" | "second" | "year", string> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric"
  });
  const entries = formatter.formatToParts(value).flatMap((part) => {
    if (part.type === "literal") {
      return [];
    }

    return [[part.type, part.value] as const];
  });

  return Object.fromEntries(entries) as Record<"day" | "hour" | "minute" | "month" | "second" | "year", string>;
}
