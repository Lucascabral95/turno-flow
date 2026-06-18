package worker

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
	"github.com/turnoflow/turnoflow/apps/worker/internal/email"
)

func TestHandleEventCreatesWaitlistOfferOnlyOnce(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")
	event := cancellationEvent(t)

	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("first handle event: %v", err)
	}
	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("second handle event: %v", err)
	}

	if repository.offerCount != 1 {
		t.Fatalf("expected one offer, got %d", repository.offerCount)
	}
	if len(sender.messages) != 1 {
		t.Fatalf("expected one email, got %d", len(sender.messages))
	}
	if len(repository.notificationLogs) != 1 {
		t.Fatalf("expected one notification log, got %d", len(repository.notificationLogs))
	}
}

func TestHandleEventSchedulesReminderOnlyOnceForAppointmentBooked(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.reminderSettings = ReminderSettings{
		Channel:       "mock",
		Enabled:       true,
		OffsetMinutes: 60,
		Template:      "custom_reminder",
	}
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")
	event := bookedEvent(t)

	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("first handle event: %v", err)
	}
	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("second handle event: %v", err)
	}

	if len(repository.scheduledNotifications) != 1 {
		t.Fatalf("expected one scheduled notification, got %d", len(repository.scheduledNotifications))
	}
	notification := repository.scheduledNotifications[0]
	if notification.Template != "custom_reminder" {
		t.Fatalf("unexpected template %q", notification.Template)
	}
	expectedDueAt := time.Date(2026, 6, 17, 9, 0, 0, 0, time.UTC)
	if !notification.DueAt.Equal(expectedDueAt) {
		t.Fatalf("expected due at %s, got %s", expectedDueAt, notification.DueAt)
	}
	if len(repository.outboxEvents) != 1 {
		t.Fatalf("expected one outbox event, got %d", len(repository.outboxEvents))
	}
	outboxEvent := repository.outboxEvents[0]
	if outboxEvent.Type != domain.EventReminderScheduled {
		t.Fatalf("unexpected outbox event type %q", outboxEvent.Type)
	}
	if outboxEvent.RoutingKey != reminderScheduledRoutingKey {
		t.Fatalf("unexpected routing key %q", outboxEvent.RoutingKey)
	}
	if len(sender.messages) != 0 {
		t.Fatalf("expected no immediate email sends, got %d", len(sender.messages))
	}
}

func TestHandleEventSkipsReminderWhenSettingsAreDisabled(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.reminderSettings.Enabled = false
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")

	if err := service.HandleEvent(ctx, bookedEvent(t)); err != nil {
		t.Fatalf("handle event: %v", err)
	}

	if len(repository.scheduledNotifications) != 0 {
		t.Fatalf("expected no scheduled notifications, got %d", len(repository.scheduledNotifications))
	}
	if len(repository.outboxEvents) != 0 {
		t.Fatalf("expected no outbox events, got %d", len(repository.outboxEvents))
	}
}

func TestSendDueRemindersMarksNotificationSentAndLogsAttempt(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.dueNotifications = []DueNotification{
		{
			AppointmentID: stringPointer("appointment-1"),
			Attempts:      1,
			BusinessID:    "business-1",
			Channel:       "mock",
			DueAt:         time.Date(2026, 6, 16, 10, 0, 0, 0, time.UTC),
			Email:         "cliente@example.test",
			ID:            "notification-1",
			Template:      reminderTemplate24Hours,
		},
	}
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")

	if err := service.SendDueReminders(ctx, time.Date(2026, 6, 16, 10, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("send due reminders: %v", err)
	}

	if len(sender.messages) != 1 {
		t.Fatalf("expected one reminder email, got %d", len(sender.messages))
	}
	if len(repository.sentNotifications) != 1 {
		t.Fatalf("expected one sent notification, got %d", len(repository.sentNotifications))
	}
	if len(repository.notificationLogs) != 1 {
		t.Fatalf("expected one reminder log, got %d", len(repository.notificationLogs))
	}
	if repository.notificationLogs[0].Template != reminderTemplate24Hours {
		t.Fatalf("unexpected template %q", repository.notificationLogs[0].Template)
	}
}

func TestSendDueRemindersMarksNotificationFailedWithRetry(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.dueNotifications = []DueNotification{
		{
			AppointmentID: stringPointer("appointment-1"),
			Attempts:      1,
			BusinessID:    "business-1",
			Channel:       "mock",
			DueAt:         time.Date(2026, 6, 16, 10, 0, 0, 0, time.UTC),
			Email:         "cliente@example.test",
			ID:            "notification-1",
			Template:      reminderTemplate24Hours,
		},
	}
	sender := &fakeSender{err: assertError("mock send failed")}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")

	if err := service.SendDueReminders(ctx, time.Date(2026, 6, 16, 10, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("send due reminders: %v", err)
	}

	if len(repository.failedNotifications) != 1 {
		t.Fatalf("expected one failed notification, got %d", len(repository.failedNotifications))
	}
	if repository.failedNotifications[0].nextAttemptAt == nil {
		t.Fatal("expected retry timestamp for first failed attempt")
	}
}

type fakeRepository struct {
	candidate              *domain.WaitlistCandidate
	dueNotifications       []DueNotification
	failedNotifications    []failedNotification
	notificationLogs       []NotificationLog
	offerCount             int
	outboxEvents           []OutboxEventInput
	processed              map[string]bool
	reminderSettings       ReminderSettings
	sentNotifications      []DueNotification
	scheduledNotifications []ScheduledNotificationInput
}

type failedNotification struct {
	lastError     string
	nextAttemptAt *time.Time
	notification  DueNotification
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{
		candidate: &domain.WaitlistCandidate{
			CustomerEmail: "waitlist@example.test",
			CustomerName:  "Waitlist Customer",
			EntryID:       "waitlist-entry-1",
		},
		processed: map[string]bool{},
		reminderSettings: ReminderSettings{
			Channel:       "mock",
			Enabled:       true,
			OffsetMinutes: 1440,
			Template:      reminderTemplate24Hours,
		},
	}
}

func (repository *fakeRepository) RunOnce(ctx context.Context, eventID string, _ string, fn func(context.Context, Tx) error) (bool, error) {
	if repository.processed[eventID] {
		return false, nil
	}
	repository.processed[eventID] = true

	if err := fn(ctx, repository); err != nil {
		return false, err
	}

	return true, nil
}

func (repository *fakeRepository) CreateNotificationLog(_ context.Context, input NotificationLog) error {
	repository.notificationLogs = append(repository.notificationLogs, input)
	return nil
}

func (repository *fakeRepository) ClaimDueNotifications(_ context.Context, _ time.Time, _ int, _ int) ([]DueNotification, error) {
	return repository.dueNotifications, nil
}

func (repository *fakeRepository) CreateOutboxEvent(_ context.Context, input OutboxEventInput) error {
	repository.outboxEvents = append(repository.outboxEvents, input)
	return nil
}

func (repository *fakeRepository) CreateScheduledNotification(_ context.Context, input ScheduledNotificationInput) (string, error) {
	repository.scheduledNotifications = append(repository.scheduledNotifications, input)
	return "notification-1", nil
}

func (repository *fakeRepository) ExpireWaitlistOffers(_ context.Context, _ time.Time) error {
	return nil
}

func (repository *fakeRepository) MarkNotificationFailed(_ context.Context, notification DueNotification, lastError string, nextAttemptAt *time.Time) error {
	repository.failedNotifications = append(repository.failedNotifications, failedNotification{
		lastError:     lastError,
		nextAttemptAt: nextAttemptAt,
		notification:  notification,
	})
	repository.notificationLogs = append(repository.notificationLogs, NotificationLog{
		AppointmentID:  notification.AppointmentID,
		Attempts:       notification.Attempts,
		BusinessID:     notification.BusinessID,
		Email:          notification.Email,
		LastError:      &lastError,
		NotificationID: &notification.ID,
		Status:         NotificationFailed,
		Template:       notification.Template,
	})
	return nil
}

func (repository *fakeRepository) MarkNotificationSent(_ context.Context, notification DueNotification, _ time.Time) error {
	repository.sentNotifications = append(repository.sentNotifications, notification)
	repository.notificationLogs = append(repository.notificationLogs, NotificationLog{
		AppointmentID:  notification.AppointmentID,
		Attempts:       notification.Attempts,
		BusinessID:     notification.BusinessID,
		Email:          notification.Email,
		NotificationID: &notification.ID,
		Status:         NotificationSent,
		Template:       notification.Template,
	})
	return nil
}

func (repository *fakeRepository) CreateWaitlistOffer(_ context.Context, _ WaitlistOfferInput) error {
	repository.offerCount++
	return nil
}

func (repository *fakeRepository) FindWaitlistCandidate(_ context.Context, _ domain.AppointmentPayload) (*domain.WaitlistCandidate, error) {
	return repository.candidate, nil
}

func (repository *fakeRepository) GetReminderSettings(_ context.Context, _ string) (ReminderSettings, error) {
	return repository.reminderSettings, nil
}

func (repository *fakeRepository) MarkWaitlistEntryOffered(_ context.Context, _ string) error {
	return nil
}

type fakeSender struct {
	err      error
	messages []email.Message
}

func (sender *fakeSender) Send(_ context.Context, message email.Message) error {
	sender.messages = append(sender.messages, message)
	return sender.err
}

func cancellationEvent(t *testing.T) domain.Event {
	t.Helper()

	payload := appointmentPayload()
	payload.Status = "cancelled_by_customer"
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	return domain.Event{
		AggregateID: payload.AppointmentID,
		BusinessID:  payload.BusinessID,
		EventID:     "00000000-0000-0000-0000-000000000001",
		OccurredAt:  time.Now().UTC(),
		Payload:     body,
		Type:        domain.EventAppointmentCancelled,
		Version:     1,
	}
}

func bookedEvent(t *testing.T) domain.Event {
	t.Helper()

	payload := appointmentPayload()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	return domain.Event{
		AggregateID: payload.AppointmentID,
		BusinessID:  payload.BusinessID,
		EventID:     "00000000-0000-0000-0000-000000000002",
		OccurredAt:  time.Now().UTC(),
		Payload:     body,
		Type:        domain.EventAppointmentBooked,
		Version:     1,
	}
}

func appointmentPayload() domain.AppointmentPayload {
	payload := domain.AppointmentPayload{
		AppointmentID:     "appointment-1",
		BusinessID:        "business-1",
		CancellationToken: "cancel-token",
		Customer: domain.Customer{
			Email: "original@example.test",
			ID:    "customer-1",
			Name:  "Original Customer",
		},
		EndsAt:   time.Date(2026, 6, 17, 10, 30, 0, 0, time.UTC),
		StartsAt: time.Date(2026, 6, 17, 10, 0, 0, 0, time.UTC),
		Service: domain.Service{
			ID:   "service-1",
			Name: "Corte",
		},
		StaffMember: domain.Staff{
			ID:   "staff-1",
			Name: "Lucas",
		},
		Status: "confirmed",
	}

	return payload
}

func stringPointer(value string) *string {
	return &value
}

func assertError(message string) error {
	return errors.New(message)
}
