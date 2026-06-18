CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'mock',
  email TEXT NOT NULL,
  template TEXT NOT NULL,
  status notification_status NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ(3) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ(3),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX notifications_business_id_status_due_at_idx ON notifications(business_id, status, due_at);
CREATE INDEX notifications_appointment_id_idx ON notifications(appointment_id);
CREATE UNIQUE INDEX notifications_appointment_template_unique
  ON notifications(appointment_id, template)
  WHERE appointment_id IS NOT NULL;
