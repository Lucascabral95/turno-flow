package config

import "testing"

func TestLoadUsesDefaultsWhenEnvironmentIsEmpty(t *testing.T) {
	t.Setenv("APP_BASE_URL", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("EMAIL_FROM", "")
	t.Setenv("EMAIL_TRANSPORT", "")
	t.Setenv("RABBITMQ_URL", "")

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
}

func TestLoadUsesEnvironmentOverrides(t *testing.T) {
	t.Setenv("APP_BASE_URL", "https://turnoflow.example")
	t.Setenv("DATABASE_URL", "postgres://db.example/turnoflow")
	t.Setenv("EMAIL_FROM", "TurnoFlow <mail@example.test>")
	t.Setenv("EMAIL_TRANSPORT", "smtp")
	t.Setenv("RABBITMQ_URL", "amqp://rabbit.example:5672/")

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
}
