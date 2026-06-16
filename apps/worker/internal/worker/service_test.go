package worker

import (
	"context"
	"encoding/json"
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

func TestSendDueRemindersLogsSentNotifications(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.reminders = []domain.ReminderAppointment{
		{
			AppointmentID:     "appointment-1",
			BusinessID:        "business-1",
			CancellationToken: "cancel-token",
			CustomerEmail:     "cliente@example.test",
			CustomerName:      "Cliente",
			ServiceName:       "Corte",
			StartsAt:          time.Date(2026, 6, 17, 10, 0, 0, 0, time.UTC),
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
	if len(repository.notificationLogs) != 1 {
		t.Fatalf("expected one reminder log, got %d", len(repository.notificationLogs))
	}
	if repository.notificationLogs[0].Template != "appointment_reminder_24h" {
		t.Fatalf("unexpected template %q", repository.notificationLogs[0].Template)
	}
}

type fakeRepository struct {
	candidate        *domain.WaitlistCandidate
	notificationLogs []NotificationLog
	offerCount       int
	processed        map[string]bool
	reminders        []domain.ReminderAppointment
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{
		candidate: &domain.WaitlistCandidate{
			CustomerEmail: "waitlist@example.test",
			CustomerName:  "Waitlist Customer",
			EntryID:       "waitlist-entry-1",
		},
		processed: map[string]bool{},
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

func (repository *fakeRepository) ExpireWaitlistOffers(_ context.Context, _ time.Time) error {
	return nil
}

func (repository *fakeRepository) FindDueReminderAppointments(_ context.Context, _ time.Time, _ time.Time) ([]domain.ReminderAppointment, error) {
	return repository.reminders, nil
}

func (repository *fakeRepository) CreateWaitlistOffer(_ context.Context, _ WaitlistOfferInput) error {
	repository.offerCount++
	return nil
}

func (repository *fakeRepository) FindWaitlistCandidate(_ context.Context, _ domain.AppointmentPayload) (*domain.WaitlistCandidate, error) {
	return repository.candidate, nil
}

func (repository *fakeRepository) MarkWaitlistEntryOffered(_ context.Context, _ string) error {
	return nil
}

type fakeSender struct {
	messages []email.Message
}

func (sender *fakeSender) Send(_ context.Context, message email.Message) error {
	sender.messages = append(sender.messages, message)
	return nil
}

func cancellationEvent(t *testing.T) domain.Event {
	t.Helper()

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
		Status: "cancelled_by_customer",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	return domain.Event{
		AggregateID: "appointment-1",
		BusinessID:  "business-1",
		EventID:     "00000000-0000-0000-0000-000000000001",
		OccurredAt:  time.Now().UTC(),
		Payload:     body,
		Type:        domain.EventAppointmentCancelled,
		Version:     1,
	}
}
