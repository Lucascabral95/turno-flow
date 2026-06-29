package domain

import (
	"encoding/json"
	"time"
)

const (
	EventAppointmentBooked         = "AppointmentBooked"
	EventAppointmentConfirmed      = "AppointmentConfirmed"
	EventAppointmentCancelled      = "AppointmentCancelled"
	EventAppointmentCompleted      = "AppointmentCompleted"
	EventAppointmentMarkedAsNoShow = "AppointmentMarkedAsNoShow"
	EventAppointmentMarkedNoShow   = "AppointmentMarkedNoShow"
	EventAppointmentRescheduled    = "AppointmentRescheduled"
	EventCalendarSyncFailed        = "CalendarSyncFailed"
	EventCalendarSyncSucceeded     = "CalendarSyncSucceeded"
	EventCustomerRiskScoreUpdated  = "CustomerRiskScoreUpdated"
	EventDailyMetricsCalculated    = "DailyMetricsCalculated"
	EventReminderFailed            = "ReminderFailed"
	EventReminderScheduled         = "ReminderScheduled"
	EventReminderSent              = "ReminderSent"
	EventSlotReassigned            = "SlotReassigned"
	EventSlotReleased              = "SlotReleased"
	EventWaitlistCandidateMatched  = "WaitlistCandidateMatched"
	EventWaitlistOfferAccepted     = "WaitlistOfferAccepted"
	EventWaitlistOfferCreated      = "WaitlistOfferCreated"
	EventWaitlistOfferExpired      = "WaitlistOfferExpired"
	EventWaitlistOfferRejected     = "WaitlistOfferRejected"
)

type Event struct {
	AggregateID   string          `json:"aggregateId"`
	BusinessID    string          `json:"businessId"`
	CorrelationID string          `json:"correlationId"`
	EventID       string          `json:"eventId"`
	OccurredAt    time.Time       `json:"occurredAt"`
	Payload       json.RawMessage `json:"payload"`
	RoutingKey    string          `json:"routingKey"`
	Type          string          `json:"type"`
	Version       int             `json:"version"`
}

type AppointmentPayload struct {
	AppointmentID     string    `json:"appointmentId"`
	BusinessID        string    `json:"businessId"`
	CancellationToken string    `json:"cancellationToken"`
	Customer          Customer  `json:"customer"`
	EndsAt            time.Time `json:"endsAt"`
	PreviousEndsAt    time.Time `json:"previousEndsAt"`
	PreviousStartsAt  time.Time `json:"previousStartsAt"`
	Service           Service   `json:"service"`
	StaffMember       Staff     `json:"staffMember"`
	StartsAt          time.Time `json:"startsAt"`
	Status            string    `json:"status"`
	Source            string    `json:"source"`
	Timezone          string    `json:"timezone"`
}

type Customer struct {
	CompletedAppointments int     `json:"completedAppointments"`
	Email                 string  `json:"email"`
	ID                    string  `json:"id"`
	Name                  string  `json:"name"`
	NoShowCount           int     `json:"noShowCount"`
	Phone                 *string `json:"phone"`
	RequiresDeposit       bool    `json:"requiresDeposit"`
	RiskLevel             string  `json:"riskLevel"`
	RiskScore             int     `json:"riskScore"`
	TotalAppointments     int     `json:"totalAppointments"`
}

type Service struct {
	DurationMinutes int    `json:"durationMinutes"`
	ID              string `json:"id"`
	Name            string `json:"name"`
	PriceCents      int    `json:"priceCents"`
}

type Staff struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type WaitlistCandidate struct {
	CustomerEmail string
	CustomerName  string
	EntryID       string
	NoShowCount   int
}
