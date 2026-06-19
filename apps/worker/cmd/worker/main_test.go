package main

import (
	"reflect"
	"testing"
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
