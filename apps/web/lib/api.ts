export type Business = {
  email: string | null;
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

export type Service = {
  active: boolean;
  bufferMinutes: number;
  durationMinutes: number;
  id: string;
  name: string;
  priceCents: number;
};

export type StaffMember = {
  active: boolean;
  email: string | null;
  id: string;
  name: string;
};

export type AvailabilityRule = {
  active: boolean;
  endTime: string;
  id: string;
  staffMemberId: string;
  startTime: string;
  weekday: number;
};

export type AvailabilitySlot = {
  endsAt: string;
  staffMemberId: string;
  startsAt: string;
};

export type Appointment = {
  cancellationToken: string;
  customer: {
    email: string;
    id: string;
    name: string;
    noShowCount: number;
    phone: string | null;
  };
  endsAt: string;
  id: string;
  service: Service;
  staffMember: StaffMember;
  startsAt: string;
  status: "pending" | "confirmed" | "cancelled_by_customer" | "cancelled_by_business" | "completed" | "no_show";
};

export type DashboardMetrics = {
  activeAppointments: number;
  cancelledAppointments: number;
  completedAppointments: number;
  lostRevenueCents: number;
  noShowAppointments: number;
  noShowRate: number;
  riskyCustomers: Array<{
    email: string;
    id: string;
    name: string;
    noShowCount: number;
  }>;
  totalAppointments: number;
};

export type CurrentBusiness = Business & {
  availabilityRules: AvailabilityRule[];
  services: Service[];
  staffMembers: StaffMember[];
};

export function publicApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  return `${baseUrl}${path}`;
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(publicApiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(cents / 100);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
