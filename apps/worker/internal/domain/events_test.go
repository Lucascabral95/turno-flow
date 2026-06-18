package domain

import (
	"encoding/json"
	"testing"
	"time"
)

func TestEventJSONContractIncludesRoutingKey(t *testing.T) {
	body := []byte(`{
		"aggregateId": "appointment-1",
		"businessId": "business-1",
		"eventId": "event-1",
		"occurredAt": "2026-06-18T12:00:00Z",
		"payload": {"appointmentId":"appointment-1"},
		"routingKey": "appointment.booked",
		"type": "AppointmentBooked",
		"version": 1
	}`)

	var event Event
	if err := json.Unmarshal(body, &event); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}

	if event.Type != EventAppointmentBooked {
		t.Fatalf("unexpected type %q", event.Type)
	}
	if event.RoutingKey != "appointment.booked" {
		t.Fatalf("unexpected routing key %q", event.RoutingKey)
	}
	if !event.OccurredAt.Equal(time.Date(2026, 6, 18, 12, 0, 0, 0, time.UTC)) {
		t.Fatalf("unexpected occurredAt %s", event.OccurredAt)
	}
	if string(event.Payload) != `{"appointmentId":"appointment-1"}` {
		t.Fatalf("unexpected payload %s", string(event.Payload))
	}
}

func TestAppointmentPayloadJSONContract(t *testing.T) {
	body := []byte(`{
		"appointmentId": "appointment-1",
		"businessId": "business-1",
		"cancellationToken": "cancel-token",
		"customer": {
			"email": "client@example.test",
			"id": "customer-1",
			"name": "Client",
			"noShowCount": 2,
			"phone": null
		},
		"endsAt": "2026-06-18T12:30:00Z",
		"service": {
			"durationMinutes": 30,
			"id": "service-1",
			"name": "Corte",
			"priceCents": 120000
		},
		"staffMember": {
			"id": "staff-1",
			"name": "Lucas"
		},
		"startsAt": "2026-06-18T12:00:00Z",
		"status": "confirmed"
	}`)

	var payload AppointmentPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("unmarshal appointment payload: %v", err)
	}

	if payload.Customer.Phone != nil {
		t.Fatalf("expected nil phone, got %q", *payload.Customer.Phone)
	}
	if payload.Service.PriceCents != 120000 {
		t.Fatalf("unexpected price cents %d", payload.Service.PriceCents)
	}
	if payload.StaffMember.Name != "Lucas" {
		t.Fatalf("unexpected staff member %q", payload.StaffMember.Name)
	}
}
