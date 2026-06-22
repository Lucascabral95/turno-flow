package email

import (
	"bytes"
	"context"
	"log"
	"strings"
	"testing"
	"time"
)

func TestJSONSenderUsesDefaultFromWhenMessageFromIsEmpty(t *testing.T) {
	var logs bytes.Buffer
	previousOutput := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() {
		log.SetOutput(previousOutput)
	})

	sender := NewJSONSender("TurnoFlow <noreply@example.test>")
	err := sender.Send(context.Background(), Message{
		To:      "client@example.test",
		Subject: "Recordatorio",
		Text:    "Tu turno es manana",
	})
	if err != nil {
		t.Fatalf("send email: %v", err)
	}

	output := logs.String()
	for _, expected := range []string{
		`"From":"TurnoFlow \u003cnoreply@example.test\u003e"`,
		`"To":"client@example.test"`,
		`"Subject":"Recordatorio"`,
		`"Text":"Tu turno es manana"`,
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("expected log output to contain %s, got %s", expected, output)
		}
	}
}

func TestJSONSenderPreservesExplicitFrom(t *testing.T) {
	var logs bytes.Buffer
	previousOutput := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() {
		log.SetOutput(previousOutput)
	})

	sender := NewJSONSender("TurnoFlow <noreply@example.test>")
	err := sender.Send(context.Background(), Message{
		From:    "Custom <custom@example.test>",
		To:      "client@example.test",
		Subject: "Oferta",
		Text:    "Se libero un turno",
	})
	if err != nil {
		t.Fatalf("send email: %v", err)
	}

	output := logs.String()
	if !strings.Contains(output, `"From":"Custom \u003ccustom@example.test\u003e"`) {
		t.Fatalf("expected explicit from in log output, got %s", output)
	}
}

func TestNewSMTPSenderValidatesRequiredConfig(t *testing.T) {
	tests := []struct {
		config SMTPConfig
		name   string
	}{
		{name: "host", config: SMTPConfig{User: "user@example.test", Password: "secret", Port: 587}},
		{name: "port", config: SMTPConfig{Host: "smtp.example.test", User: "user@example.test", Password: "secret"}},
		{name: "user", config: SMTPConfig{Host: "smtp.example.test", Password: "secret", Port: 587}},
		{name: "password", config: SMTPConfig{Host: "smtp.example.test", User: "user@example.test", Port: 587}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := NewSMTPSender(test.config); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestNewSMTPSenderUsesDefaultsForOptionalConfig(t *testing.T) {
	sender, err := NewSMTPSender(SMTPConfig{
		Host:     "smtp.example.test",
		Password: "secret",
		Port:     587,
		User:     "user@example.test",
	})
	if err != nil {
		t.Fatalf("new smtp sender: %v", err)
	}

	if sender.config.From != "user@example.test" {
		t.Fatalf("unexpected from %q", sender.config.From)
	}
	if sender.config.Timeout != 10*time.Second {
		t.Fatalf("unexpected timeout %s", sender.config.Timeout)
	}
}

func TestBuildSMTPMessageSanitizesHeadersAndUsesCRLF(t *testing.T) {
	message := string(buildSMTPMessage(Message{
		From:    "TurnoFlow <mail@example.test>",
		To:      "client@example.test",
		Subject: "Recordatorio\r\nInjected: bad",
		Text:    "Linea uno\nLinea dos",
	}))

	for _, expected := range []string{
		"From: TurnoFlow <mail@example.test>\r\n",
		"To: client@example.test\r\n",
		"Subject: RecordatorioInjected: bad\r\n",
		"MIME-Version: 1.0\r\n",
		"Content-Type: text/plain; charset=UTF-8\r\n",
		"\r\nLinea uno\r\nLinea dos",
	} {
		if !strings.Contains(message, expected) {
			t.Fatalf("expected smtp message to contain %q, got %q", expected, message)
		}
	}
}

func TestParseEmailAddressSupportsDisplayName(t *testing.T) {
	address, err := parseEmailAddress("TurnoFlow <mail@example.test>")
	if err != nil {
		t.Fatalf("parse email address: %v", err)
	}
	if address != "mail@example.test" {
		t.Fatalf("unexpected address %q", address)
	}
}
