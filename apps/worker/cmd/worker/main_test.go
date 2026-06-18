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

	expectedBindings := []string{"appointment.booked", "appointment.cancelled", "appointment.marked_no_show"}
	if !reflect.DeepEqual(eventBindingKeys, expectedBindings) {
		t.Fatalf("unexpected binding keys %#v", eventBindingKeys)
	}
}
