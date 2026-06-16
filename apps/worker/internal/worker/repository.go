package worker

import (
	"context"
	"time"

	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
)

type NotificationStatus string

const (
	NotificationSent   NotificationStatus = "sent"
	NotificationFailed NotificationStatus = "failed"
)

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

type Repository interface {
	RunOnce(ctx context.Context, eventID string, eventType string, fn func(context.Context, Tx) error) (bool, error)
	CreateNotificationLog(ctx context.Context, input NotificationLog) error
	ExpireWaitlistOffers(ctx context.Context, now time.Time) error
	FindDueReminderAppointments(ctx context.Context, from time.Time, until time.Time) ([]domain.ReminderAppointment, error)
}

type Tx interface {
	CreateNotificationLog(ctx context.Context, input NotificationLog) error
	CreateWaitlistOffer(ctx context.Context, input WaitlistOfferInput) error
	FindWaitlistCandidate(ctx context.Context, appointment domain.AppointmentPayload) (*domain.WaitlistCandidate, error)
	MarkWaitlistEntryOffered(ctx context.Context, entryID string) error
}
