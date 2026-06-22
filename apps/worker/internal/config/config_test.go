package config

import "testing"

func TestLoadUsesDefaultsWhenEnvironmentIsEmpty(t *testing.T) {
	t.Setenv("APP_BASE_URL", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("EMAIL_FROM", "")
	t.Setenv("EMAIL_TRANSPORT", "")
	t.Setenv("RABBITMQ_URL", "")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_PASSWORD", "")
	t.Setenv("SMTP_PORT", "")
	t.Setenv("SMTP_TIMEOUT_SECONDS", "")
	t.Setenv("SMTP_USER", "")

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
	if cfg.RabbitMQURL != "amqp://guest:guest@localhost:5672/" {
		t.Fatalf("unexpected rabbitmq url %q", cfg.RabbitMQURL)
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
	t.Setenv("RABBITMQ_URL", "amqp://rabbit.example:5672/")
	t.Setenv("SMTP_HOST", "smtp.example.test")
	t.Setenv("SMTP_PASSWORD", "secret")
	t.Setenv("SMTP_PORT", "2525")
	t.Setenv("SMTP_TIMEOUT_SECONDS", "5")
	t.Setenv("SMTP_USER", "mail@example.test")

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
	if cfg.RabbitMQURL != "amqp://rabbit.example:5672/" {
		t.Fatalf("unexpected rabbitmq url %q", cfg.RabbitMQURL)
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
