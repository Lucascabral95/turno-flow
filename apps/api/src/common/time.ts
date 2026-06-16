export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must use YYYY-MM-DD format");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
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
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(remainingMinutes).padStart(2, "0");

  return new Date(`${date}T${paddedHours}:${paddedMinutes}:00.000Z`);
}
