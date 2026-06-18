package worker

import (
	"context"
	"encoding/json"
	"time"

	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
)

type NotificationStatus string

const (
	NotificationPending NotificationStatus = "pending"
	NotificationSent    NotificationStatus = "sent"
	NotificationFailed  NotificationStatus = "failed"
)

type ScheduledNotificationInput struct {
	AppointmentID string
	BusinessID    string
	Channel       string
	CustomerID    string
	DueAt         time.Time
	Email         string
	Payload       json.RawMessage
	Template      string
}

type NotificationLog struct {
	AppointmentID   *string
	BusinessID      string
	Email           string
	LastError       *string
	Status          NotificationStatus
	Template        string
	WaitlistEntryID *string
}

type WaitlistOfferInput struct {
	AppointmentID   string
	ExpiresAt       time.Time
	Token           string
	WaitlistEntryID string
}

type OutboxEventInput struct {
	AggregateID string
	BusinessID  string
	Payload     json.RawMessage
	RoutingKey  string
	Type        string
	Version     int
}

type Repository interface {
	RunOnce(ctx context.Context, eventID string, eventType string, fn func(context.Context, Tx) error) (bool, error)
	CreateNotificationLog(ctx context.Context, input NotificationLog) error
	ExpireWaitlistOffers(ctx context.Context, now time.Time) error
	FindDueReminderAppointments(ctx context.Context, from time.Time, until time.Time) ([]domain.ReminderAppointment, error)
}

type Tx interface {
	CreateNotificationLog(ctx context.Context, input NotificationLog) error
	CreateOutboxEvent(ctx context.Context, input OutboxEventInput) error
	CreateScheduledNotification(ctx context.Context, input ScheduledNotificationInput) (string, error)
	CreateWaitlistOffer(ctx context.Context, input WaitlistOfferInput) error
	FindWaitlistCandidate(ctx context.Context, appointment domain.AppointmentPayload) (*domain.WaitlistCandidate, error)
	MarkWaitlistEntryOffered(ctx context.Context, entryID string) error
}
