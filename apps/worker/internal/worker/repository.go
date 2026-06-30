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
	Timezone      string
}

type CustomerAttendance struct {
	BusinessID            string
	CompletedAppointments int
	CustomerID            string
	NoShowCount           int
	TotalAppointments     int
}

type CustomerRiskSnapshot struct {
	BusinessID            string
	CompletedAppointments int
	CustomerID            string
	LastCalculatedAt      time.Time
	NoShowCount           int
	RequiresDeposit       bool
	RiskLevel             string
	RiskScore             int
	TotalAppointments     int
}

type BusinessMetricsDailySnapshot struct {
	ActiveAppointments    int
	BusinessID            string
	CancelledAppointments int
	CompletedAppointments int
	Date                  time.Time
	EstimatedRevenueCents int
	LostRevenueCents      int
	NoShowAppointments    int
	TotalAppointments     int
}

type CalendarAppointment struct {
	AppointmentID string
	BusinessID    string
	CustomerEmail string
	CustomerName  string
	CustomerPhone *string
	EndsAt        time.Time
	ServiceName   string
	StaffName     string
	StartsAt      time.Time
	Status        string
	Timezone      string
}

type CalendarConnection struct {
	AccessTokenEncrypted  *string
	BusinessID            string
	ExpiresAt             *time.Time
	ID                    string
	RefreshTokenEncrypted *string
	StaffMemberID         *string
}

type CalendarSyncTarget struct {
	Appointment   CalendarAppointment
	Connection    *CalendarConnection
	GoogleEventID *string
}

type CalendarConnectionTokenUpdate struct {
	AccessTokenEncrypted string
	ConnectionID         string
	ExpiresAt            time.Time
}

type CalendarEventSyncResult struct {
	AppointmentID        string
	BusinessID           string
	CalendarConnectionID string
	GoogleEventID        *string
	LastError            *string
	Status               string
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

type AdvanceRecurringSeriesInput struct {
	AppointmentID      string
	BusinessID         string
	CancellationToken  string
	Conflict           bool
	CustomerEmail      string
	CustomerID         string
	CustomerName       string
	CustomerPhone      *string
	EndsAt             time.Time
	ServiceDurationMin int
	ServiceID          string
	ServiceName        string
	SeriesID           string
	StaffMemberID      string
	StaffMemberName    string
	StartsAt           time.Time
}

type Repository interface {
	RunOnce(ctx context.Context, eventID string, eventType string, fn func(context.Context, Tx) error) (bool, error)
	CreateAttendanceReviewAlerts(ctx context.Context, now time.Time, limit int) (int, error)
	CreateNotificationLog(ctx context.Context, input NotificationLog) error
	ClaimDueNotifications(ctx context.Context, now time.Time, limit int, maxAttempts int) ([]DueNotification, error)
	ClaimDueRecurringSeries(ctx context.Context, now time.Time, batchSize int) ([]domain.RecurringSeries, error)
	IsSlotTaken(ctx context.Context, staffMemberID string, startsAt, endsAt time.Time) (bool, error)
	AdvanceRecurringSeries(ctx context.Context, input AdvanceRecurringSeriesInput) error
	ExpireWaitlistOffers(ctx context.Context, now time.Time) error
	MarkNotificationFailed(ctx context.Context, notification DueNotification, lastError string, nextAttemptAt *time.Time) error
	MarkNotificationSent(ctx context.Context, notification DueNotification, sentAt time.Time) error
}

type Tx interface {
	CreateNotificationLog(ctx context.Context, input NotificationLog) error
	CreateOutboxEvent(ctx context.Context, input OutboxEventInput) error
	CreateScheduledNotification(ctx context.Context, input ScheduledNotificationInput) (string, error)
	CreateWaitlistOffer(ctx context.Context, input WaitlistOfferInput) (string, error)
	FindWaitlistCandidate(ctx context.Context, appointment domain.AppointmentPayload) (*domain.WaitlistCandidate, error)
	GetCalendarSyncTarget(ctx context.Context, appointmentID string) (*CalendarSyncTarget, error)
	GetCustomerAttendance(ctx context.Context, businessID string, customerID string) (CustomerAttendance, error)
	GetReminderSettings(ctx context.Context, businessID string) (ReminderSettings, error)
	MarkCalendarConnectionError(ctx context.Context, connectionID string, status string, lastError string) error
	MarkWaitlistEntryOffered(ctx context.Context, entryID string) error
	RecalculateBusinessMetricsDaily(ctx context.Context, businessID string, metricDate time.Time) (BusinessMetricsDailySnapshot, error)
	RecordCalendarEventSync(ctx context.Context, result CalendarEventSyncResult) error
	UpdateCalendarConnectionToken(ctx context.Context, update CalendarConnectionTokenUpdate) error
	UpdateCustomerRisk(ctx context.Context, risk CustomerRiskSnapshot) error
}
