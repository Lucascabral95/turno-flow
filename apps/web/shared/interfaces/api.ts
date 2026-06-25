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

export type CustomerProfile = {
  appointments: Appointment[];
  completedAppointments: number;
  email: string;
  estimatedSpendCents: number;
  id: string;
  lastAppointmentAt: string | null;
  lastRiskCalculatedAt: string | null;
  name: string;
  nextAppointmentAt: string | null;
  noShowCount: number;
  phone: string | null;
  recurrenceRate: number;
  requiresDeposit: boolean;
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  totalAppointments: number;
  waitlistEntries: unknown[];
};

export type CurrentBusiness = Business & {
  availabilityExceptions: AvailabilityException[];
  availabilityRules: AvailabilityRule[];
  services: Service[];
  staffMembers: StaffMember[];
};
