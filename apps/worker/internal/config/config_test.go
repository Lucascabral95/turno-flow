package config

import "testing"

func TestLoadUsesDefaultsWhenEnvironmentIsEmpty(t *testing.T) {
	t.Setenv("APP_BASE_URL", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("EMAIL_FROM", "")
	t.Setenv("EMAIL_TRANSPORT", "")
	t.Setenv("GOOGLE_CALENDAR_CLIENT_ID", "")
	t.Setenv("GOOGLE_CALENDAR_CLIENT_SECRET", "")
	t.Setenv("GOOGLE_CALENDAR_TIMEOUT_SECONDS", "")
	t.Setenv("CALENDAR_TOKEN_ENCRYPTION_KEY", "")
	t.Setenv("MAX_NOTIFICATION_ATTEMPTS", "")
	t.Setenv("RABBITMQ_URL", "")
	t.Setenv("RABBITMQ_PREFETCH", "")
	t.Setenv("REMINDER_BATCH_SIZE", "")
	t.Setenv("SCHEDULER_INTERVAL_SECONDS", "")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_PASSWORD", "")
	t.Setenv("SMTP_PORT", "")
	t.Setenv("SMTP_TIMEOUT_SECONDS", "")
	t.Setenv("SMTP_USER", "")
	t.Setenv("ATTENDANCE_BATCH_SIZE", "")
	t.Setenv("WORKER_CONCURRENCY", "")
	t.Setenv("WORKER_MODE", "")

	cfg := Load()

	if cfg.AppBaseURL != "http://localhost:3000" {
		t.Fatalf("unexpected app base url %q", cfg.AppBaseURL)
	}
	if cfg.DatabaseURL != "postgres://turnoflow:turnoflow@localhost:5432/turnoflow?sslmode=disable" {
		t.Fatalf("unexpected database url %q", cfg.DatabaseURL)
	}
	if cfg.EmailFrom != "TurnoFlow <noreply@turnoflow.local>" {
		t.Fatalf("unexpected email from %q", cfg.EmailFrom)
	}
	if cfg.EmailTransport != "json" {
		t.Fatalf("unexpected email transport %q", cfg.EmailTransport)
	}
	if cfg.HasGoogleCalendarSync() {
		t.Fatal("google calendar sync should be disabled by default")
	}
	if cfg.GoogleCalendarTimeoutSeconds != 10 {
		t.Fatalf("unexpected google calendar timeout %d", cfg.GoogleCalendarTimeoutSeconds)
	}
	if cfg.RabbitMQURL != "amqp://guest:guest@localhost:5672/" {
		t.Fatalf("unexpected rabbitmq url %q", cfg.RabbitMQURL)
	}
	if cfg.WorkerMode != WorkerModeAll {
		t.Fatalf("unexpected worker mode %q", cfg.WorkerMode)
	}
	if cfg.WorkerConcurrency != 4 {
		t.Fatalf("unexpected worker concurrency %d", cfg.WorkerConcurrency)
	}
	if cfg.RabbitMQPrefetch != 8 {
		t.Fatalf("unexpected rabbitmq prefetch %d", cfg.RabbitMQPrefetch)
	}
	if cfg.ReminderBatchSize != 25 {
		t.Fatalf("unexpected reminder batch size %d", cfg.ReminderBatchSize)
	}
	if cfg.AttendanceBatchSize != 25 {
		t.Fatalf("unexpected attendance batch size %d", cfg.AttendanceBatchSize)
	}
	if cfg.MaxNotificationAttempts != 3 {
		t.Fatalf("unexpected max notification attempts %d", cfg.MaxNotificationAttempts)
	}
	if cfg.SchedulerIntervalSeconds != 60 {
		t.Fatalf("unexpected scheduler interval %d", cfg.SchedulerIntervalSeconds)
	}
	if cfg.SMTPHost != "smtp.gmail.com" {
		t.Fatalf("unexpected smtp host %q", cfg.SMTPHost)
	}
	if cfg.SMTPPort != 587 {
		t.Fatalf("unexpected smtp port %d", cfg.SMTPPort)
	}
	if cfg.SMTPTimeoutSeconds != 10 {
		t.Fatalf("unexpected smtp timeout %d", cfg.SMTPTimeoutSeconds)
	}
	if cfg.SMTPUser != "" {
		t.Fatalf("unexpected smtp user %q", cfg.SMTPUser)
	}
	if cfg.SMTPPassword != "" {
		t.Fatalf("unexpected smtp password %q", cfg.SMTPPassword)
	}
}

func TestLoadUsesEnvironmentOverrides(t *testing.T) {
	t.Setenv("APP_BASE_URL", "https://turnoflow.example")
	t.Setenv("DATABASE_URL", "postgres://db.example/turnoflow")
	t.Setenv("EMAIL_FROM", "TurnoFlow <mail@example.test>")
	t.Setenv("EMAIL_TRANSPORT", "smtp")
	t.Setenv("GOOGLE_CALENDAR_CLIENT_ID", "google-client-id")
	t.Setenv("GOOGLE_CALENDAR_CLIENT_SECRET", "google-client-secret")
	t.Setenv("GOOGLE_CALENDAR_TIMEOUT_SECONDS", "7")
	t.Setenv("CALENDAR_TOKEN_ENCRYPTION_KEY", "calendar-key")
	t.Setenv("MAX_NOTIFICATION_ATTEMPTS", "5")
	t.Setenv("RABBITMQ_URL", "amqp://rabbit.example:5672/")
	t.Setenv("RABBITMQ_PREFETCH", "12")
	t.Setenv("REMINDER_BATCH_SIZE", "40")
	t.Setenv("SCHEDULER_INTERVAL_SECONDS", "30")
	t.Setenv("SMTP_HOST", "smtp.example.test")
	t.Setenv("SMTP_PASSWORD", "secret")
	t.Setenv("SMTP_PORT", "2525")
	t.Setenv("SMTP_TIMEOUT_SECONDS", "5")
	t.Setenv("SMTP_USER", "mail@example.test")
	t.Setenv("ATTENDANCE_BATCH_SIZE", "35")
	t.Setenv("WORKER_CONCURRENCY", "6")
	t.Setenv("WORKER_MODE", WorkerModeConsumer)

	cfg := Load()

	if cfg.AppBaseURL != "https://turnoflow.example" {
		t.Fatalf("unexpected app base url %q", cfg.AppBaseURL)
	}
	if cfg.DatabaseURL != "postgres://db.example/turnoflow" {
		t.Fatalf("unexpected database url %q", cfg.DatabaseURL)
	}
	if cfg.EmailFrom != "TurnoFlow <mail@example.test>" {
		t.Fatalf("unexpected email from %q", cfg.EmailFrom)
	}
	if cfg.EmailTransport != "smtp" {
		t.Fatalf("unexpected email transport %q", cfg.EmailTransport)
	}
	if !cfg.HasGoogleCalendarSync() {
		t.Fatal("google calendar sync should be enabled")
	}
	if cfg.GoogleCalendarClientID != "google-client-id" {
		t.Fatalf("unexpected google calendar client id %q", cfg.GoogleCalendarClientID)
	}
	if cfg.GoogleCalendarClientSecret != "google-client-secret" {
		t.Fatalf("unexpected google calendar client secret %q", cfg.GoogleCalendarClientSecret)
	}
	if cfg.GoogleCalendarTimeoutSeconds != 7 {
		t.Fatalf("unexpected google calendar timeout %d", cfg.GoogleCalendarTimeoutSeconds)
	}
	if cfg.CalendarTokenEncryptionKey != "calendar-key" {
		t.Fatalf("unexpected calendar token encryption key %q", cfg.CalendarTokenEncryptionKey)
	}
	if cfg.RabbitMQURL != "amqp://rabbit.example:5672/" {
		t.Fatalf("unexpected rabbitmq url %q", cfg.RabbitMQURL)
	}
	if cfg.WorkerMode != WorkerModeConsumer {
		t.Fatalf("unexpected worker mode %q", cfg.WorkerMode)
	}
	if cfg.WorkerConcurrency != 6 {
		t.Fatalf("unexpected worker concurrency %d", cfg.WorkerConcurrency)
	}
	if cfg.RabbitMQPrefetch != 12 {
		t.Fatalf("unexpected rabbitmq prefetch %d", cfg.RabbitMQPrefetch)
	}
	if cfg.ReminderBatchSize != 40 {
		t.Fatalf("unexpected reminder batch size %d", cfg.ReminderBatchSize)
	}
	if cfg.AttendanceBatchSize != 35 {
		t.Fatalf("unexpected attendance batch size %d", cfg.AttendanceBatchSize)
	}
	if cfg.MaxNotificationAttempts != 5 {
		t.Fatalf("unexpected max notification attempts %d", cfg.MaxNotificationAttempts)
	}
	if cfg.SchedulerIntervalSeconds != 30 {
		t.Fatalf("unexpected scheduler interval %d", cfg.SchedulerIntervalSeconds)
	}
	if cfg.SMTPHost != "smtp.example.test" {
		t.Fatalf("unexpected smtp host %q", cfg.SMTPHost)
	}
	if cfg.SMTPPort != 2525 {
		t.Fatalf("unexpected smtp port %d", cfg.SMTPPort)
	}
	if cfg.SMTPTimeoutSeconds != 5 {
		t.Fatalf("unexpected smtp timeout %d", cfg.SMTPTimeoutSeconds)
	}
	if cfg.SMTPUser != "mail@example.test" {
		t.Fatalf("unexpected smtp user %q", cfg.SMTPUser)
	}
	if cfg.SMTPPassword != "secret" {
		t.Fatalf("unexpected smtp password %q", cfg.SMTPPassword)
	}
}

func TestLoadFallsBackForInvalidPositiveIntegers(t *testing.T) {
	t.Setenv("WORKER_CONCURRENCY", "-1")
	t.Setenv("RABBITMQ_PREFETCH", "0")
	t.Setenv("REMINDER_BATCH_SIZE", "nope")

	cfg := Load()

	if cfg.WorkerConcurrency != 4 {
		t.Fatalf("unexpected worker concurrency %d", cfg.WorkerConcurrency)
	}
	if cfg.RabbitMQPrefetch != 8 {
		t.Fatalf("unexpected rabbitmq prefetch %d", cfg.RabbitMQPrefetch)
	}
	if cfg.ReminderBatchSize != 25 {
		t.Fatalf("unexpected reminder batch size %d", cfg.ReminderBatchSize)
	}
}

func TestValidateRejectsInvalidWorkerMode(t *testing.T) {
	cfg := Load()
	cfg.WorkerMode = "sidecar"

	if err := cfg.Validate(); err == nil {
		t.Fatal("expected invalid worker mode error")
	}
}

func TestValidateRejectsIncompleteGoogleCalendarConfig(t *testing.T) {
	cfg := Load()
	cfg.GoogleCalendarClientID = "client-id"
	cfg.GoogleCalendarClientSecret = ""
	cfg.CalendarTokenEncryptionKey = "key"

	if err := cfg.Validate(); err == nil {
		t.Fatal("expected incomplete google calendar config error")
	}
}

func TestWorkerModePredicates(t *testing.T) {
	cfg := Load()
	cfg.WorkerMode = WorkerModeAll
	if !cfg.ShouldRunConsumer() || !cfg.ShouldRunScheduler() {
		t.Fatal("all mode should run consumer and scheduler")
	}

	cfg.WorkerMode = WorkerModeConsumer
	if !cfg.ShouldRunConsumer() || cfg.ShouldRunScheduler() {
		t.Fatal("consumer mode should only run consumer")
	}

	cfg.WorkerMode = WorkerModeScheduler
	if cfg.ShouldRunConsumer() || !cfg.ShouldRunScheduler() {
		t.Fatal("scheduler mode should only run scheduler")
	}
}
