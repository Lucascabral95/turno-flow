package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/turnoflow/turnoflow/apps/worker/internal/config"
	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
	"github.com/turnoflow/turnoflow/apps/worker/internal/email"
	worker "github.com/turnoflow/turnoflow/apps/worker/internal/worker"
)

func TestRabbitMQContracts(t *testing.T) {
	if eventsExchange != "turnoflow.events" {
		t.Fatalf("unexpected exchange %q", eventsExchange)
	}
	if workerQueue != "worker.appointments" {
		t.Fatalf("unexpected worker queue %q", workerQueue)
	}
	if workerQueueDLQ != "worker.appointments.dlq" {
		t.Fatalf("unexpected worker dlq %q", workerQueueDLQ)
	}
	if deadLetterExchange != "turnoflow.events.dlx" {
		t.Fatalf("unexpected dead letter exchange %q", deadLetterExchange)
	}

	expectedBindings := []string{
		"appointment.booked",
		"appointment.confirmed",
		"appointment.cancelled",
		"appointment.completed",
		"appointment.no_show",
		"appointment.marked_no_show",
		"appointment.rescheduled",
		"appointment.reminder_due",
		"notification.reminder_due",
		"slot.reassigned",
		"slot.released",
		"waitlist.offer_expired",
		"waitlist.offer_rejected",
		"staff.created",
		"staff.updated",
		"staff.deactivated",
		"member.invited",
		"member.accepted",
		"member.role_changed",
	}
	if !reflect.DeepEqual(eventBindingKeys, expectedBindings) {
		t.Fatalf("unexpected binding keys %#v", eventBindingKeys)
	}
}

func TestCreateCalendarSyncUsesGoogleCalendarConfig(t *testing.T) {
	key := "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
	calendarClient, tokenCodec, err := createCalendarSync(config.Config{
		CalendarTokenEncryptionKey:   key,
		GoogleCalendarClientID:       "client-id",
		GoogleCalendarClientSecret:   "client-secret",
		GoogleCalendarTimeoutSeconds: 5,
	})
	if err != nil {
		t.Fatalf("create calendar sync: %v", err)
	}
	if _, ok := calendarClient.(*worker.GoogleCalendarClient); !ok {
		t.Fatalf("expected GoogleCalendarClient, got %T", calendarClient)
	}
	if _, ok := tokenCodec.(*worker.AESGCMTokenCodec); !ok {
		t.Fatalf("expected AESGCMTokenCodec, got %T", tokenCodec)
	}
}

func TestDecodeEventRejectsInvalidPayload(t *testing.T) {
	for _, body := range [][]byte{
		[]byte(`not-json`),
		[]byte(`{"type":"AppointmentBooked"}`),
		[]byte(`{"eventId":"event-1"}`),
	} {
		if _, err := decodeEvent(body); err == nil {
			t.Fatalf("expected invalid event error for %s", string(body))
		}
	}
}

func TestDecodeEventAcceptsMinimumContract(t *testing.T) {
	body, err := json.Marshal(domain.Event{
		EventID: "event-1",
		Type:    domain.EventAppointmentBooked,
	})
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}

	event, err := decodeEvent(body)
	if err != nil {
		t.Fatalf("decode event: %v", err)
	}
	if event.EventID != "event-1" || event.Type != domain.EventAppointmentBooked {
		t.Fatalf("unexpected event %#v", event)
	}
}

func TestRunDeliveryWorkersRespectsConfiguredConcurrency(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	deliveries := make(chan amqp.Delivery)
	var wg sync.WaitGroup
	var active int32
	var maxActive int32
	handled := make(chan struct{}, 4)

	runDeliveryWorkers(ctx, &wg, discardLogger(), 2, deliveries, nil, func(_ context.Context, _ *worker.Service, _ amqp.Delivery) {
		current := atomic.AddInt32(&active, 1)
		for {
			observed := atomic.LoadInt32(&maxActive)
			if current <= observed || atomic.CompareAndSwapInt32(&maxActive, observed, current) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		atomic.AddInt32(&active, -1)
		handled <- struct{}{}
	})

	for i := 0; i < 4; i++ {
		deliveries <- amqp.Delivery{}
	}
	for i := 0; i < 4; i++ {
		<-handled
	}

	cancel()
	close(deliveries)
	wg.Wait()

	if maxActive != 2 {
		t.Fatalf("expected max concurrency 2, got %d", maxActive)
	}
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
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
