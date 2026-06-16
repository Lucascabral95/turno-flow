export const EventTypes = {
  AppointmentCreated: "appointment.created.v1",
  AppointmentCancelled: "appointment.cancelled.v1",
  AppointmentMarkedNoShow: "appointment.marked_no_show.v1",
  AppointmentReminderDue: "appointment.reminder_due.v1",
  WaitlistOfferCreated: "waitlist.offer_created.v1"
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
