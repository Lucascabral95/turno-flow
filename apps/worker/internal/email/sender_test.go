package email

import (
	"bytes"
	"context"
	"log"
	"strings"
	"testing"
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
