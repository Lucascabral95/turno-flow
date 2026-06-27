package worker

import (
	"testing"
	"time"
)

func TestGoogleEventBodyUsesAppointmentTimezone(t *testing.T) {
	body := googleEventBody(CalendarEvent{
		AppointmentID: "appointment-1",
		Description:   "TurnoFlow",
		EndsAt:        time.Date(2026, 6, 30, 15, 30, 0, 0, time.UTC),
		StartsAt:      time.Date(2026, 6, 30, 15, 0, 0, 0, time.UTC),
		Summary:       "Corte - Lucas",
		Timezone:      "America/Argentina/Buenos_Aires",
	})

	start, ok := body["start"].(map[string]string)
	if !ok {
		t.Fatalf("expected start payload, got %#v", body["start"])
	}
	end, ok := body["end"].(map[string]string)
	if !ok {
		t.Fatalf("expected end payload, got %#v", body["end"])
	}

	if start["dateTime"] != "2026-06-30T12:00:00-03:00" {
		t.Fatalf("expected local start datetime, got %q", start["dateTime"])
	}
	if end["dateTime"] != "2026-06-30T12:30:00-03:00" {
		t.Fatalf("expected local end datetime, got %q", end["dateTime"])
	}
	if start["timeZone"] != "America/Argentina/Buenos_Aires" {
		t.Fatalf("expected timezone to be preserved, got %q", start["timeZone"])
	}
}
