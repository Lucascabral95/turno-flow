package domain

import (
	"encoding/json"
	"time"
)

const (
	EventAppointmentBooked        = "AppointmentBooked"
	EventAppointmentCancelled     = "AppointmentCancelled"
	EventAppointmentCompleted     = "AppointmentCompleted"
	EventAppointmentMarkedNoShow  = "AppointmentMarkedNoShow"
	EventCustomerRiskScoreUpdated = "CustomerRiskScoreUpdated"
	EventReminderFailed           = "ReminderFailed"
	EventReminderScheduled        = "ReminderScheduled"
	EventReminderSent             = "ReminderSent"
	EventWaitlistOfferAccepted    = "WaitlistOfferAccepted"
	EventWaitlistOfferCreated     = "WaitlistOfferCreated"
	EventWaitlistOfferExpired     = "WaitlistOfferExpired"
	EventWaitlistOfferRejected    = "WaitlistOfferRejected"
)

type Event struct {
	AggregateID string          `json:"aggregateId"`
	BusinessID  string          `json:"businessId"`
	EventID     string          `json:"eventId"`
	OccurredAt  time.Time       `json:"occurredAt"`
	Payload     json.RawMessage `json:"payload"`
	RoutingKey  string          `json:"routingKey"`
	Type        string          `json:"type"`
	Version     int             `json:"version"`
}

type AppointmentPayload struct {
	AppointmentID     string    `json:"appointmentId"`
	BusinessID        string    `json:"businessId"`
	CancellationToken string    `json:"cancellationToken"`
	Customer          Customer  `json:"customer"`
	EndsAt            time.Time `json:"endsAt"`
	Service           Service   `json:"service"`
	StaffMember       Staff     `json:"staffMember"`
	StartsAt          time.Time `json:"startsAt"`
	Status            string    `json:"status"`
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
