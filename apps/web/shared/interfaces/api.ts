export type Business = {
  email: string | null;
  id: string;
  manualDepositsEnabled?: boolean;
  name: string;
  paymentAccountHolder?: string | null;
  paymentAccountLabel?: string | null;
  paymentAlias?: string | null;
  paymentInstructions?: string | null;
  slug: string;
  timezone: string;
};

export type OnboardingStepKey = "business" | "service" | "staff" | "availability" | "public_page";

export type OnboardingTaskStatus = {
  completed: boolean;
  key: string;
  required: boolean;
  title: string;
};

export type OnboardingAnalyticsStep = {
  abandonmentCount: number;
  completedAt: string | null;
  eventCount: number;
  key: OnboardingStepKey;
  lastActivityAt: string | null;
  lastViewedAt: string | null;
};

export type OnboardingAnalytics = {
  currentStepEnteredAt: string | null;
  dismissCount: number;
  lastActivityAt: string | null;
  lastDismissedAt: string | null;
  lastSharedAt: string | null;
  lastTestBookingAt: string | null;
  stalledStep: OnboardingStepKey | null;
  steps: OnboardingAnalyticsStep[];
};

export type OnboardingStatus = {
  analytics: OnboardingAnalytics;
  completedAt: string | null;
  currentStep: OnboardingStepKey;
  dismissedAt: string | null;
  isReadyToSell: boolean;
  nextStep: OnboardingStepKey;
  progressPercent: number;
  steps: Array<{
    completed: boolean;
    description: string;
    key: OnboardingStepKey;
    progressPercent: number;
    tasks: OnboardingTaskStatus[];
    title: string;
  }>;
};

export type Service = {
  active: boolean;
  bufferMinutes: number;
  depositAmountCents: number;
  depositDescription: string | null;
  depositEnabled: boolean;
  depositMode: "fixed" | "percentage";
  depositPercentage: number;
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
  paymentSummary?: {
    confirmedDepositCents: number;
    remainingBalanceCents: number;
    status: "not_submitted" | "submitted" | "confirmed" | "rejected" | "voided";
    submittedDepositCents: number;
  };
  payments?: AppointmentPayment[];
  service: Service;
  staffMember: StaffMember;
  startsAt: string;
  status: "pending" | "confirmed" | "cancelled_by_customer" | "cancelled_by_business" | "completed" | "no_show";
};

export type AppointmentPayment = {
  amountCents: number;
  confirmedAt: string | null;
  currency: string;
  customerNote: string | null;
  id: string;
  internalNote: string | null;
  reference: string | null;
  rejectedAt: string | null;
  remainingBalanceCents: number;
  status: "submitted" | "confirmed" | "rejected" | "voided";
  submittedAt: string;
  type: "deposit";
  voidedAt: string | null;
};

export type PaymentSettings = {
  businessId: string;
  manualDepositsEnabled: boolean;
  paymentAccountHolder: string | null;
  paymentAccountLabel: string | null;
  paymentAlias: string | null;
  paymentInstructions: string | null;
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
  channel: "mock" | "smtp";
  enabled: boolean;
  offsetMinutes: number;
  template: string;
};

export type NotificationTemplate = {
  active: boolean;
  body: string;
  businessId: string;
  createdAt: string;
  id: string;
  key: string;
  name: string;
  subject: string;
  updatedAt: string;
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
  attendanceRate: number;
  cancelledAppointments: number;
  completedAppointments: number;
  email: string;
  estimatedSpendCents: number;
  favoriteServices: Array<{
    bookings: number;
    name: string;
    serviceId: string;
  }>;
  id: string;
  lastAppointmentAt: string | null;
  lastNotePreview: string | null;
  lastRiskCalculatedAt: string | null;
  name: string;
  nextAppointmentAt: string | null;
  noShowCount: number;
  noShowRate: number;
  notesCount: number;
  phone: string | null;
  recurrenceRate: number;
  requiresDeposit: boolean;
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  totalAppointments: number;
  waitlistEntries: CustomerWaitlistEntry[];
};

export type CustomerNote = {
  author: {
    email: string;
    id: string;
    name: string;
  } | null;
  content: string;
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type CustomerWaitlistEntry = {
  createdAt: string;
  earliestTime: string | null;
  id: string;
  latestTime: string | null;
  offers: Array<{
    appointmentId: string;
    createdAt: string;
    expiresAt: string;
    id: string;
    status: "pending" | "accepted" | "expired" | "rejected";
  }>;
  preferredDateEnd: string;
  preferredDateStart: string;
  priorityScore: number;
  service: Service;
  status: "waiting" | "offered" | "booked" | "expired" | "cancelled";
};

export type CustomerDetail = CustomerProfile & {
  appointments: Appointment[];
  notes: CustomerNote[];
  waitlistEntries: CustomerWaitlistEntry[];
};

export type CustomerListResponse = {
  items: CustomerProfile[];
  page: number;
  pageSize: number;
  total: number;
};

export type BusinessMemberRole = "OWNER" | "RECEPTIONIST" | "PROFESSIONAL";
export type BusinessMemberStatus = "ACTIVE" | "INACTIVE" | "PENDING_INVITE";

export type BusinessMember = {
  active: boolean;
  createdAt: string;
  id: string;
  inviteEmail: string | null;
  role: "OWNER" | "RECEPTIONIST" | "PROFESSIONAL";
  staffMember: {
    email: string | null;
    id: string;
    name: string;
  } | null;
  status: BusinessMemberStatus;
  user: {
    email: string;
    id: string;
    name: string;
  } | null;
};

export type CurrentUser = {
  email: string;
  id: string;
  name: string;
};

export type StaffMetrics = {
  cancelledAppointments: number;
  completedAppointments: number;
  estimatedRevenueCents: number;
  noShowAppointments: number;
  noShowRate: number;
  occupancyMinutes: number;
  staffMemberId: string;
  staffMemberName: string;
  totalAppointments: number;
};

export type WaitlistEntry = {
  customer: {
    email: string;
    id: string;
    name: string;
    phone: string | null;
    riskLevel: "low" | "medium" | "high";
    riskScore: number;
  };
  earliestTime: string | null;
  id: string;
  latestTime: string | null;
  offers: Array<{
    appointmentId: string;
    expiresAt: string;
    id: string;
    status: "pending" | "accepted" | "expired" | "rejected";
  }>;
  preferredDateEnd: string;
  preferredDateStart: string;
  priorityScore: number;
  service: Service;
  status: "waiting" | "offered" | "booked" | "expired" | "cancelled";
};

export type CalendarConnection = {
  accountEmail: string | null;
  externalCalendarId: string | null;
  id: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  provider: "google";
  staffMember: {
    email: string | null;
    id: string;
    name: string;
  } | null;
  status: "not_configured" | "connected" | "expired" | "error";
};

export type CurrentBusiness = Business & {
  availabilityExceptions: AvailabilityException[];
  availabilityRules: AvailabilityRule[];
  onboarding?: OnboardingStatus;
  services: Service[];
  staffMembers: StaffMember[];
};
