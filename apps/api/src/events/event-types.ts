export const EventTypes = {
  AppointmentBooked: "AppointmentBooked",
  AppointmentCancelled: "AppointmentCancelled",
  AppointmentCompleted: "AppointmentCompleted",
  AppointmentMarkedNoShow: "AppointmentMarkedNoShow",
  AppointmentReminderDue: "AppointmentReminderDue",
  CustomerRiskScoreUpdated: "CustomerRiskScoreUpdated",
  ReminderFailed: "ReminderFailed",
  ReminderScheduled: "ReminderScheduled",
  ReminderSent: "ReminderSent",
  AvailabilityExceptionCreated: "AvailabilityExceptionCreated",
  AvailabilityRuleCreated: "AvailabilityRuleCreated",
  ServiceCreated: "ServiceCreated",
  WaitlistEntryCreated: "WaitlistEntryCreated",
  WaitlistOfferAccepted: "WaitlistOfferAccepted",
  WaitlistOfferCreated: "WaitlistOfferCreated",
  WaitlistOfferExpired: "WaitlistOfferExpired",
  WaitlistOfferRejected: "WaitlistOfferRejected",
  MetricsRecalculate: "MetricsRecalculate"
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const EventRoutingKeys = {
  AppointmentBooked: "appointment.booked",
  AppointmentCancelled: "appointment.cancelled",
  AppointmentCompleted: "appointment.completed",
  AppointmentMarkedNoShow: "appointment.marked_no_show",
  AppointmentReminderDue: "appointment.reminder_due",
  CustomerRiskScoreUpdated: "customer.risk_score_updated",
  ReminderFailed: "reminder.failed",
  ReminderScheduled: "reminder.scheduled",
  ReminderSent: "reminder.sent",
  AvailabilityExceptionCreated: "availability.exception_created",
  AvailabilityRuleCreated: "availability.rule_created",
  ServiceCreated: "service.created",
  WaitlistEntryCreated: "waitlist.entry_created",
  WaitlistOfferAccepted: "waitlist.offer_accepted",
  WaitlistOfferCreated: "waitlist.offer_created",
  WaitlistOfferExpired: "waitlist.offer_expired",
  WaitlistOfferRejected: "waitlist.offer_rejected",
  MetricsRecalculate: "metrics.recalculate"
} as const satisfies Record<keyof typeof EventTypes, string>;

export type EventRoutingKey = (typeof EventRoutingKeys)[keyof typeof EventRoutingKeys];
