CREATE TYPE availability_exception_type AS ENUM (
  'blocked',
  'extra_opening'
);

CREATE TABLE availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_member_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  type availability_exception_type NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX availability_exceptions_business_id_date_idx ON availability_exceptions(business_id, date);
CREATE INDEX availability_exceptions_staff_member_id_date_idx ON availability_exceptions(staff_member_id, date);

ALTER TABLE event_outbox RENAME TO outbox_events;
ALTER INDEX event_outbox_status_created_at_idx RENAME TO outbox_events_status_created_at_idx;

ALTER TABLE outbox_events ADD COLUMN routing_key TEXT;

UPDATE outbox_events
SET routing_key = CASE
  WHEN type = 'appointment.created.v1' THEN 'appointment.booked'
  WHEN type = 'appointment.cancelled.v1' THEN 'appointment.cancelled'
  WHEN type = 'appointment.marked_no_show.v1' THEN 'appointment.marked_no_show'
  WHEN type = 'appointment.reminder_due.v1' THEN 'appointment.reminder_due'
  WHEN type = 'waitlist.offer_created.v1' THEN 'waitlist.offer_created'
  ELSE type
END;

UPDATE outbox_events
SET type = CASE
  WHEN type = 'appointment.created.v1' THEN 'AppointmentBooked'
  WHEN type = 'appointment.cancelled.v1' THEN 'AppointmentCancelled'
  WHEN type = 'appointment.marked_no_show.v1' THEN 'AppointmentMarkedNoShow'
  WHEN type = 'appointment.reminder_due.v1' THEN 'AppointmentReminderDue'
  WHEN type = 'waitlist.offer_created.v1' THEN 'WaitlistOfferCreated'
  ELSE type
END;

ALTER TABLE outbox_events ALTER COLUMN routing_key SET NOT NULL;
