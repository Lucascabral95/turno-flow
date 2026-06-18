export const EventTypes = {
  AppointmentBooked: "AppointmentBooked",
  AppointmentCancelled: "AppointmentCancelled",
  AppointmentMarkedNoShow: "AppointmentMarkedNoShow",
  AppointmentReminderDue: "AppointmentReminderDue",
  ReminderScheduled: "ReminderScheduled",
  AvailabilityExceptionCreated: "AvailabilityExceptionCreated",
  AvailabilityRuleCreated: "AvailabilityRuleCreated",
  ServiceCreated: "ServiceCreated",
  WaitlistEntryCreated: "WaitlistEntryCreated",
  WaitlistOfferCreated: "WaitlistOfferCreated",
  WaitlistOfferExpired: "WaitlistOfferExpired",
  MetricsRecalculate: "MetricsRecalculate"
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const EventRoutingKeys = {
  AppointmentBooked: "appointment.booked",
  AppointmentCancelled: "appointment.cancelled",
  AppointmentMarkedNoShow: "appointment.marked_no_show",
  AppointmentReminderDue: "appointment.reminder_due",
  ReminderScheduled: "reminder.scheduled",
  AvailabilityExceptionCreated: "availability.exception_created",
  AvailabilityRuleCreated: "availability.rule_created",
  ServiceCreated: "service.created",
  WaitlistEntryCreated: "waitlist.entry_created",
  WaitlistOfferCreated: "waitlist.offer_created",
  WaitlistOfferExpired: "waitlist.offer_expired",
  MetricsRecalculate: "metrics.recalculate"
} as const satisfies Record<keyof typeof EventTypes, string>;

export type EventRoutingKey = (typeof EventRoutingKeys)[keyof typeof EventRoutingKeys];
