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

type ReminderSettings struct {
	Channel       string
	Enabled       bool
	OffsetMinutes int
	Template      string
}

type DueNotification struct {
	AppointmentID *string
	Attempts      int
	BusinessID    string
	Channel       string
	DueAt         time.Time
	Email         string
	ID            string
	Payload       json.RawMessage
	Template      string
}

type NotificationLog struct {
	AppointmentID   *string
	Attempts        int
	BusinessID      string
	Email           string
	LastError       *string
	NotificationID  *string
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
	ClaimDueNotifications(ctx context.Context, now time.Time, limit int, maxAttempts int) ([]DueNotification, error)
	ExpireWaitlistOffers(ctx context.Context, now time.Time) error
	MarkNotificationFailed(ctx context.Context, notification DueNotification, lastError string, nextAttemptAt *time.Time) error
	MarkNotificationSent(ctx context.Context, notification DueNotification, sentAt time.Time) error
}

type Tx interface {
	CreateNotificationLog(ctx context.Context, input NotificationLog) error
	CreateOutboxEvent(ctx context.Context, input OutboxEventInput) error
	CreateScheduledNotification(ctx context.Context, input ScheduledNotificationInput) (string, error)
	CreateWaitlistOffer(ctx context.Context, input WaitlistOfferInput) error
	FindWaitlistCandidate(ctx context.Context, appointment domain.AppointmentPayload) (*domain.WaitlistCandidate, error)
	GetReminderSettings(ctx context.Context, businessID string) (ReminderSettings, error)
	MarkWaitlistEntryOffered(ctx context.Context, entryID string) error
}
