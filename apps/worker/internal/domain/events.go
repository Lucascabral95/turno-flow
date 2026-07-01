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
	EventMemberAccepted            = "MemberAccepted"
	EventMemberInvited             = "MemberInvited"
	EventMemberRoleChanged         = "MemberRoleChanged"
	EventReminderFailed            = "ReminderFailed"
	EventReminderScheduled         = "ReminderScheduled"
	EventReminderSent              = "ReminderSent"
	EventSlotReassigned            = "SlotReassigned"
	EventSlotReleased              = "SlotReleased"
	EventStaffMemberCreated        = "StaffMemberCreated"
	EventStaffMemberDeactivated    = "StaffMemberDeactivated"
	EventStaffMemberUpdated        = "StaffMemberUpdated"
	EventWaitlistCandidateMatched        = "WaitlistCandidateMatched"
	EventWaitlistOfferAccepted           = "WaitlistOfferAccepted"
	EventWaitlistOfferCreated            = "WaitlistOfferCreated"
	EventWaitlistOfferExpired            = "WaitlistOfferExpired"
	EventWaitlistOfferRejected           = "WaitlistOfferRejected"
	EventRecurringSeriesCreated          = "RecurringSeriesCreated"
	EventRecurringAppointmentScheduled   = "RecurringAppointmentScheduled"
	EventRecurringSeriesCompleted        = "RecurringSeriesCompleted"
	EventRecurringSeriesConflict         = "RecurringSeriesConflict"
	EventCustomerPortalLoginRequested    = "CustomerPortalLoginRequested"
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
	BusinessName      string    `json:"businessName"`
	BusinessSlug      string    `json:"businessSlug"`
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

type StaffMemberPayload struct {
	Active       bool    `json:"active"`
	BusinessID   string  `json:"businessId"`
	Email        *string `json:"email"`
	Name         string  `json:"name"`
	StaffMemberID string  `json:"staffMemberId"`
}

type MemberPayload struct {
	BusinessID  string `json:"businessId"`
	DirectAdd   bool   `json:"directAdd"`
	Email       string `json:"email"`
	MemberID    string `json:"memberId"`
	NewRole     string `json:"newRole,omitempty"`
	PreviousRole string `json:"previousRole,omitempty"`
	Role        string `json:"role,omitempty"`
	UserID      string `json:"userId,omitempty"`
}

type CustomerPortalLoginPayload struct {
	BusinessID    string `json:"businessId"`
	BusinessName  string `json:"businessName"`
	BusinessSlug  string `json:"businessSlug"`
	CustomerEmail string `json:"customerEmail"`
	CustomerID    string `json:"customerId"`
	CustomerName  string `json:"customerName"`
	Token         string `json:"token"`
}

type WaitlistCandidate struct {
	CustomerEmail string
	CustomerName  string
	EntryID       string
	NoShowCount   int
}
