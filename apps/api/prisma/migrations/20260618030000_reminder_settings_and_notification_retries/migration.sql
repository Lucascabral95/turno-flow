CREATE TABLE business_reminder_settings (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  offset_minutes INTEGER NOT NULL DEFAULT 1440,
  channel TEXT NOT NULL DEFAULT 'mock',
  template TEXT NOT NULL DEFAULT 'appointment_reminder_24h',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO business_reminder_settings (business_id)
SELECT id
FROM businesses
ON CONFLICT (business_id) DO NOTHING;

ALTER TABLE notifications
  ADD COLUMN next_attempt_at TIMESTAMPTZ(3);

UPDATE notifications
SET next_attempt_at = due_at
WHERE next_attempt_at IS NULL;

ALTER TABLE notifications
  ALTER COLUMN next_attempt_at SET NOT NULL;

CREATE INDEX notifications_status_next_attempt_at_idx ON notifications(status, next_attempt_at);

ALTER TABLE notification_logs
  ADD COLUMN notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL;

CREATE INDEX notification_logs_notification_id_idx ON notification_logs(notification_id);
