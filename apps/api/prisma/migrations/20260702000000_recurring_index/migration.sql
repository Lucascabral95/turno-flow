CREATE INDEX IF NOT EXISTS "appointments_recurring_series_status_starts_at_idx"
  ON "appointments"("recurring_series_id", "status", "starts_at");
