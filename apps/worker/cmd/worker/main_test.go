package main

import (
	"reflect"
	"strings"
	"testing"

	"github.com/turnoflow/turnoflow/apps/worker/internal/config"
	"github.com/turnoflow/turnoflow/apps/worker/internal/email"
)

func TestRabbitMQContracts(t *testing.T) {
	if eventsExchange != "turnoflow.events" {
		t.Fatalf("unexpected exchange %q", eventsExchange)
	}
	if workerQueue != "worker.appointments" {
		t.Fatalf("unexpected worker queue %q", workerQueue)
	}

	expectedBindings := []string{
		"appointment.booked",
		"appointment.confirmed",
		"appointment.cancelled",
		"appointment.completed",
		"appointment.no_show",
		"appointment.marked_no_show",
		"appointment.reminder_due",
		"notification.reminder_due",
		"slot.reassigned",
		"slot.released",
		"waitlist.offer_expired",
		"waitlist.offer_rejected",
	}
	if !reflect.DeepEqual(eventBindingKeys, expectedBindings) {
		t.Fatalf("unexpected binding keys %#v", eventBindingKeys)
	}
}

func TestStartupRetryPolicy(t *testing.T) {
	if startupRetryAttempts != 30 {
		t.Fatalf("unexpected retry attempts %d", startupRetryAttempts)
	}
	if startupRetryDelay <= 0 {
		t.Fatal("startup retry delay must be positive")
	}
}

func TestCreateEmailSenderUsesJSONTransport(t *testing.T) {
	sender, err := createEmailSender(config.Config{
		EmailFrom:      "TurnoFlow <mail@example.test>",
		EmailTransport: "json",
	})
	if err != nil {
		t.Fatalf("create email sender: %v", err)
	}

	if _, ok := sender.(*email.JSONSender); !ok {
		t.Fatalf("expected JSONSender, got %T", sender)
	}
}

func TestCreateEmailSenderUsesSMTPTransport(t *testing.T) {
	sender, err := createEmailSender(config.Config{
		EmailFrom:          "TurnoFlow <mail@example.test>",
		EmailTransport:     "smtp",
		SMTPHost:           "smtp.example.test",
		SMTPPassword:       "secret",
		SMTPPort:           587,
		SMTPTimeoutSeconds: 5,
		SMTPUser:           "mail@example.test",
	})
	if err != nil {
		t.Fatalf("create email sender: %v", err)
	}

	if _, ok := sender.(*email.SMTPSender); !ok {
		t.Fatalf("expected SMTPSender, got %T", sender)
	}
}

func TestCreateEmailSenderRejectsInvalidTransport(t *testing.T) {
	_, err := createEmailSender(config.Config{EmailTransport: "unknown"})
	if err == nil {
		t.Fatal("expected invalid transport error")
	}
	if !strings.Contains(err.Error(), "unsupported email transport") {
		t.Fatalf("unexpected error %v", err)
	}
}

func TestCreateEmailSenderRejectsIncompleteSMTPConfig(t *testing.T) {
	_, err := createEmailSender(config.Config{
		EmailTransport:     "smtp",
		SMTPHost:           "smtp.example.test",
		SMTPPort:           587,
		SMTPTimeoutSeconds: 5,
		SMTPUser:           "mail@example.test",
	})
	if err == nil {
		t.Fatal("expected smtp config error")
	}
}
