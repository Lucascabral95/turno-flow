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

export type AvailabilityException = {
  date: string;
  endTime: string;
  id: string;
  reason: string | null;
  staffMemberId: string | null;
  startTime: string;
  type: "BLOCKED" | "EXTRA_OPENING";
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
  estimatedRevenueCents: number;
  lostRevenueCents: number;
  noShowAppointments: number;
  noShowRate: number;
  recurringCustomers: Array<{
    appointments: number;
    customerId: string;
    email: string;
    name: string;
  }>;
  riskyCustomers: Array<{
    completedAppointments: number;
    email: string;
    id: string;
    lastRiskCalculatedAt: string | null;
    name: string;
    noShowCount: number;
    requiresDeposit: boolean;
    riskLevel: "low" | "medium" | "high";
    riskScore: number;
    totalAppointments: number;
  }>;
  topServices: Array<{
    bookings: number;
    name: string;
    serviceId: string;
  }>;
  totalAppointments: number;
  weeklyBreakdown: Array<{
    activeAppointments: number;
    cancelledAppointments: number;
    completedAppointments: number;
    date: string;
    estimatedRevenueCents: number;
    lostRevenueCents: number;
    noShowAppointments: number;
    totalAppointments: number;
  }>;
};

export type ReminderSettings = {
  businessId: string;
  channel: "mock";
  enabled: boolean;
  offsetMinutes: number;
  template: string;
};

export type NotificationHistoryItem = {
  appointment: {
    customer: {
      id: string;
      name: string;
    };
    id: string;
    service: {
      id: string;
      name: string;
    };
    startsAt: string;
    status: Appointment["status"];
  } | null;
  attempts: number;
  createdAt: string;
  email: string;
  id: string;
  lastError: string | null;
  sentAt: string | null;
  status: "pending" | "sent" | "failed";
  template: string;
};

export type CurrentBusiness = Business & {
  availabilityExceptions: AvailabilityException[];
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
  const responseText = await response.text();
  const body = parseJsonBody(responseText);

  if (!response.ok) {
    throw new Error(errorMessageFromBody(body) ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

function parseJsonBody(value: string): unknown {
  if (value.trim() === "") {
    return null;
  }

  return JSON.parse(value);
}

function errorMessageFromBody(value: unknown): string | undefined {
  if (!hasMessage(value)) {
    return undefined;
  }

  const { message } = value;
  return typeof message === "string" ? message : undefined;
}

function hasMessage(value: unknown): value is { message: unknown } {
  return typeof value === "object" && value !== null && "message" in value;
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

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: value === 0 ? 0 : 1
  }).format(value * 100);
}
