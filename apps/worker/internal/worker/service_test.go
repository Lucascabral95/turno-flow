package worker

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
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
	if len(repository.outboxEvents) != 3 {
		t.Fatalf("expected three outbox events, got %d", len(repository.outboxEvents))
	}
	if len(repository.metricsRecalculated) != 1 {
		t.Fatalf("expected one metrics recalculation, got %d", len(repository.metricsRecalculated))
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventWaitlistCandidateMatched, waitlistCandidateMatchedRoutingKey) {
		t.Fatal("expected waitlist candidate matched outbox event")
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventWaitlistOfferCreated, waitlistOfferCreatedRoutingKey) {
		t.Fatal("expected waitlist offer created outbox event")
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventDailyMetricsCalculated, dailyMetricsCalculatedRoutingKey) {
		t.Fatal("expected daily metrics calculated outbox event")
	}
	if !strings.Contains(sender.messages[0].Text, "/reject") {
		t.Fatalf("expected waitlist offer email to include reject link, got %q", sender.messages[0].Text)
	}
	if !strings.Contains(sender.messages[0].Text, "17/06/2026 07:00 (America/Argentina/Buenos_Aires)") {
		t.Fatalf("expected waitlist offer email to use business local time, got %q", sender.messages[0].Text)
	}
}

func TestHandleEventCreatesNextOfferAfterWaitlistOfferRejected(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")
	event := cancellationEvent(t)
	event.EventID = "00000000-0000-0000-0000-000000000099"
	event.Type = domain.EventWaitlistOfferRejected

	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("handle rejected offer event: %v", err)
	}

	if repository.offerCount != 1 {
		t.Fatalf("expected one next offer, got %d", repository.offerCount)
	}
	if len(sender.messages) != 1 {
		t.Fatalf("expected one waitlist email, got %d", len(sender.messages))
	}
}

func TestHandleEventSendsEmailWhenBusinessCancelsAppointment(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.candidate = nil
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")
	event := cancellationEvent(t)
	event.Payload = appointmentEventPayload(t, "cancelled_by_business")

	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("handle business cancellation event: %v", err)
	}

	if len(sender.messages) != 1 {
		t.Fatalf("expected one cancellation email, got %d", len(sender.messages))
	}
	message := sender.messages[0]
	for _, expected := range []string{
		"Tu turno fue cancelado",
		"Hola Original Customer",
		"Corte",
		"17/06/2026 07:00 (America/Argentina/Buenos_Aires)",
	} {
		if !strings.Contains(message.Subject+" "+message.Text, expected) {
			t.Fatalf("expected cancellation email to contain %q, got subject=%q text=%q", expected, message.Subject, message.Text)
		}
	}
	if len(repository.notificationLogs) != 1 {
		t.Fatalf("expected one notification log, got %d", len(repository.notificationLogs))
	}
	log := repository.notificationLogs[0]
	if log.Template != "appointment_cancelled_by_business" || log.Status != NotificationSent {
		t.Fatalf("unexpected cancellation log %#v", log)
	}
}

func TestHandleEventDoesNotSendCancellationEmailWhenCustomerCancelsAppointment(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.candidate = nil
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")

	if err := service.HandleEvent(ctx, cancellationEvent(t)); err != nil {
		t.Fatalf("handle customer cancellation event: %v", err)
	}

	if len(sender.messages) != 0 {
		t.Fatalf("expected no cancellation email for customer cancellation, got %d", len(sender.messages))
	}
	if len(repository.notificationLogs) != 0 {
		t.Fatalf("expected no notification log for customer cancellation, got %d", len(repository.notificationLogs))
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
	if len(repository.outboxEvents) != 2 {
		t.Fatalf("expected two outbox events, got %d", len(repository.outboxEvents))
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventReminderScheduled, reminderScheduledRoutingKey) {
		t.Fatal("expected reminder scheduled outbox event")
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventDailyMetricsCalculated, dailyMetricsCalculatedRoutingKey) {
		t.Fatal("expected daily metrics calculated outbox event")
	}
	if len(repository.metricsRecalculated) != 1 {
		t.Fatalf("expected one metrics recalculation, got %d", len(repository.metricsRecalculated))
	}
	if len(sender.messages) != 0 {
		t.Fatalf("expected no immediate email sends, got %d", len(sender.messages))
	}
}

func TestHandleEventSyncsGoogleCalendarForAppointmentBooked(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	accessToken := "access-token"
	repository.calendarSyncTarget = &CalendarSyncTarget{
		Appointment: CalendarAppointment{
			AppointmentID: "appointment-1",
			BusinessID:    "business-1",
			CustomerEmail: "original@example.test",
			CustomerName:  "Original Customer",
			EndsAt:        time.Date(2026, 6, 17, 10, 30, 0, 0, time.UTC),
			ServiceName:   "Corte",
			StaffName:     "Lucas",
			StartsAt:      time.Date(2026, 6, 17, 10, 0, 0, 0, time.UTC),
			Status:        "confirmed",
			Timezone:      "America/Argentina/Buenos_Aires",
		},
		Connection: &CalendarConnection{
			AccessTokenEncrypted: &accessToken,
			BusinessID:           "business-1",
			ExpiresAt:            timePointer(time.Now().UTC().Add(time.Hour)),
			ID:                   "calendar-connection-1",
			StaffMemberID:        stringPointer("staff-1"),
		},
	}
	calendar := &fakeCalendarClient{createdEventID: "google-event-1"}
	service := NewService(repository, &fakeSender{}, "http://localhost:3000", "noreply@example.test").
		WithCalendarSync(calendar, fakeTokenCodec{})

	if err := service.HandleEvent(ctx, bookedEvent(t)); err != nil {
		t.Fatalf("handle booked event: %v", err)
	}

	if len(calendar.createdEvents) != 1 {
		t.Fatalf("expected one google calendar event creation, got %d", len(calendar.createdEvents))
	}
	if len(repository.calendarSyncResults) != 1 {
		t.Fatalf("expected one calendar sync result, got %d", len(repository.calendarSyncResults))
	}
	result := repository.calendarSyncResults[0]
	if result.Status != "synced" {
		t.Fatalf("expected synced status, got %q", result.Status)
	}
	if result.GoogleEventID == nil || *result.GoogleEventID != "google-event-1" {
		t.Fatalf("expected google event id to be recorded, got %#v", result.GoogleEventID)
	}
}

func TestHandleEventDeduplicatesExistingGoogleCalendarEvents(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	accessToken := "access-token"
	repository.calendarSyncTarget = &CalendarSyncTarget{
		Appointment: CalendarAppointment{
			AppointmentID: "appointment-1",
			BusinessID:    "business-1",
			CustomerEmail: "original@example.test",
			CustomerName:  "Original Customer",
			EndsAt:        time.Date(2026, 6, 17, 10, 30, 0, 0, time.UTC),
			ServiceName:   "Corte",
			StaffName:     "Lucas",
			StartsAt:      time.Date(2026, 6, 17, 10, 0, 0, 0, time.UTC),
			Status:        "confirmed",
			Timezone:      "America/Argentina/Buenos_Aires",
		},
		Connection: &CalendarConnection{
			AccessTokenEncrypted: &accessToken,
			BusinessID:           "business-1",
			ExpiresAt:            timePointer(time.Now().UTC().Add(time.Hour)),
			ID:                   "calendar-connection-1",
			StaffMemberID:        stringPointer("staff-1"),
		},
	}
	calendar := &fakeCalendarClient{listedEventIDs: []string{"google-event-1", "google-event-duplicate"}}
	service := NewService(repository, &fakeSender{}, "http://localhost:3000", "noreply@example.test").
		WithCalendarSync(calendar, fakeTokenCodec{})

	if err := service.HandleEvent(ctx, bookedEvent(t)); err != nil {
		t.Fatalf("handle booked event: %v", err)
	}

	if len(calendar.createdEvents) != 0 {
		t.Fatalf("expected no google calendar event creation, got %d", len(calendar.createdEvents))
	}
	if len(calendar.updatedEvents) != 1 {
		t.Fatalf("expected one google calendar event update, got %d", len(calendar.updatedEvents))
	}
	if len(calendar.deletedEventIDs) != 1 || calendar.deletedEventIDs[0] != "google-event-duplicate" {
		t.Fatalf("expected duplicate event deletion, got %#v", calendar.deletedEventIDs)
	}
	result := repository.calendarSyncResults[0]
	if result.GoogleEventID == nil || *result.GoogleEventID != "google-event-1" {
		t.Fatalf("expected primary google event id to be recorded, got %#v", result.GoogleEventID)
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
	if len(repository.outboxEvents) != 1 {
		t.Fatalf("expected one metrics outbox event, got %d", len(repository.outboxEvents))
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventDailyMetricsCalculated, dailyMetricsCalculatedRoutingKey) {
		t.Fatal("expected daily metrics calculated outbox event")
	}
	if len(repository.metricsRecalculated) != 1 {
		t.Fatalf("expected one metrics recalculation, got %d", len(repository.metricsRecalculated))
	}
}

func TestHandleEventPublishesUpdatedCustomerRiskAfterNoShow(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	repository.attendance = CustomerAttendance{
		BusinessID:            "business-1",
		CompletedAppointments: 1,
		CustomerID:            "customer-1",
		NoShowCount:           3,
		TotalAppointments:     5,
	}
	service := NewService(repository, &fakeSender{}, "http://localhost:3000", "noreply@example.test")
	event := bookedEvent(t)
	event.EventID = "00000000-0000-0000-0000-000000000010"
	event.Type = domain.EventAppointmentMarkedAsNoShow

	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("handle customer risk event: %v", err)
	}

	if len(repository.customerRiskUpdates) != 1 {
		t.Fatalf("expected one customer risk update, got %d", len(repository.customerRiskUpdates))
	}
	risk := repository.customerRiskUpdates[0]
	if risk.RiskLevel != "high" {
		t.Fatalf("expected high risk level, got %q", risk.RiskLevel)
	}
	if risk.RiskScore != 100 {
		t.Fatalf("expected capped risk score 100, got %d", risk.RiskScore)
	}
	if !risk.RequiresDeposit {
		t.Fatal("expected customer to require deposit")
	}
	if len(repository.outboxEvents) != 2 {
		t.Fatalf("expected two outbox events, got %d", len(repository.outboxEvents))
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventCustomerRiskScoreUpdated, customerRiskUpdatedRoutingKey) {
		t.Fatal("expected customer risk score updated outbox event")
	}
	if !hasOutboxEvent(repository.outboxEvents, domain.EventDailyMetricsCalculated, dailyMetricsCalculatedRoutingKey) {
		t.Fatal("expected daily metrics calculated outbox event")
	}
	if len(repository.metricsRecalculated) != 1 {
		t.Fatalf("expected one metrics recalculation, got %d", len(repository.metricsRecalculated))
	}
}

func TestHandleEventStillAcceptsLegacyNoShowEvent(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	service := NewService(repository, &fakeSender{}, "http://localhost:3000", "noreply@example.test")
	event := bookedEvent(t)
	event.EventID = "00000000-0000-0000-0000-000000000011"
	event.Type = domain.EventAppointmentMarkedNoShow

	if err := service.HandleEvent(ctx, event); err != nil {
		t.Fatalf("handle legacy no-show event: %v", err)
	}

	if len(repository.customerRiskUpdates) != 1 {
		t.Fatalf("expected one customer risk update, got %d", len(repository.customerRiskUpdates))
	}
}

func TestHandleEventRecalculatesMetricsAfterCancellation(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	sender := &fakeSender{}
	service := NewService(repository, sender, "http://localhost:3000", "noreply@example.test")

	if err := service.HandleEvent(ctx, cancellationEvent(t)); err != nil {
		t.Fatalf("handle cancellation event: %v", err)
	}

	if len(repository.metricsRecalculated) != 1 {
		t.Fatalf("expected one metrics recalculation, got %d", len(repository.metricsRecalculated))
	}
	if repository.metricsRecalculated[0].BusinessID != "business-1" {
		t.Fatalf("unexpected metrics business id %q", repository.metricsRecalculated[0].BusinessID)
	}
}

func TestProcessAttendanceAlertsRequestsBatchForOverdueAppointments(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	service := NewService(repository, &fakeSender{}, "http://localhost:3000", "noreply@example.test")
	now := time.Date(2026, 6, 19, 11, 0, 0, 0, time.UTC)

	if err := service.ProcessAttendanceAlerts(ctx, now); err != nil {
		t.Fatalf("process attendance alerts: %v", err)
	}

	if len(repository.attendanceAlertRuns) != 1 {
		t.Fatalf("expected one attendance alert run, got %d", len(repository.attendanceAlertRuns))
	}
	run := repository.attendanceAlertRuns[0]
	if !run.now.Equal(now) {
		t.Fatalf("expected run time %s, got %s", now, run.now)
	}
	if run.limit != attendanceReviewBatchSize {
		t.Fatalf("expected batch size %d, got %d", attendanceReviewBatchSize, run.limit)
	}
}

func TestServiceUsesConfiguredBatchSizes(t *testing.T) {
	ctx := context.Background()
	repository := newFakeRepository()
	service := NewServiceWithOptions(repository, &fakeSender{}, "http://localhost:3000", "noreply@example.test", Options{
		AttendanceReviewBatchSize: 7,
		DueNotificationBatchSize:  9,
		MaxNotificationAttempts:   4,
	})
	now := time.Date(2026, 6, 19, 11, 0, 0, 0, time.UTC)

	if err := service.ProcessAttendanceAlerts(ctx, now); err != nil {
		t.Fatalf("process attendance alerts: %v", err)
	}
	if err := service.SendDueReminders(ctx, now); err != nil {
		t.Fatalf("send due reminders: %v", err)
	}

	if repository.attendanceAlertRuns[0].limit != 7 {
		t.Fatalf("expected attendance batch size 7, got %d", repository.attendanceAlertRuns[0].limit)
	}
	if repository.lastDueNotificationLimit != 9 {
		t.Fatalf("expected reminder batch size 9, got %d", repository.lastDueNotificationLimit)
	}
	if repository.lastMaxNotificationAttempts != 4 {
		t.Fatalf("expected max notification attempts 4, got %d", repository.lastMaxNotificationAttempts)
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
			Payload: json.RawMessage(`{
				"cancelUrl": "http://localhost:3000/cancel/appointment-1?token=token",
				"customerName": "Ana",
				"serviceName": "Corte clasico",
				"startsAt": "2026-06-17T14:00:00Z",
				"timezone": "America/Argentina/Buenos_Aires"
			}`),
			Template: reminderTemplate24Hours,
			Timezone: "UTC",
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
	message := sender.messages[0]
	for _, expected := range []string{
		"Hola Ana",
		"Corte clasico",
		"17/06/2026 11:00 (America/Argentina/Buenos_Aires)",
		"http://localhost:3000/cancel/appointment-1?token=token",
	} {
		if !strings.Contains(message.Text, expected) {
			t.Fatalf("expected reminder email to contain %q, got %q", expected, message.Text)
		}
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

func TestFormatReminderStartTimeFallsBackToNotificationTimezone(t *testing.T) {
	startsAt := formatReminderStartTime(
		"2026-06-17T14:00:00Z",
		time.Date(2026, 6, 16, 10, 0, 0, 0, time.UTC),
		"America/Argentina/Buenos_Aires",
	)

	if startsAt != "17/06/2026 11:00 (America/Argentina/Buenos_Aires)" {
		t.Fatalf("expected local reminder time, got %q", startsAt)
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
	attendance                  CustomerAttendance
	attendanceAlertRuns         []attendanceAlertRun
	candidate                   *domain.WaitlistCandidate
	customerRiskUpdates         []CustomerRiskSnapshot
	calendarConnectionErrors    []calendarConnectionError
	calendarSyncResults         []CalendarEventSyncResult
	calendarSyncTarget          *CalendarSyncTarget
	calendarTokenUpdates        []CalendarConnectionTokenUpdate
	dueNotifications            []DueNotification
	failedNotifications         []failedNotification
	metricsRecalculated         []BusinessMetricsDailySnapshot
	notificationLogs            []NotificationLog
	offerCount                  int
	outboxEvents                []OutboxEventInput
	processed                   map[string]bool
	reminderSettings            ReminderSettings
	sentNotifications           []DueNotification
	scheduledNotifications      []ScheduledNotificationInput
	lastDueNotificationLimit    int
	lastMaxNotificationAttempts int
}

type calendarConnectionError struct {
	connectionID string
	lastError    string
	status       string
}

type failedNotification struct {
	lastError     string
	nextAttemptAt *time.Time
	notification  DueNotification
}

type attendanceAlertRun struct {
	limit int
	now   time.Time
}

func newFakeRepository() *fakeRepository {
	return &fakeRepository{
		attendance: CustomerAttendance{
			BusinessID:            "business-1",
			CompletedAppointments: 0,
			CustomerID:            "customer-1",
			NoShowCount:           0,
			TotalAppointments:     1,
		},
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

func (repository *fakeRepository) CreateAttendanceReviewAlerts(_ context.Context, now time.Time, limit int) (int, error) {
	repository.attendanceAlertRuns = append(repository.attendanceAlertRuns, attendanceAlertRun{
		limit: limit,
		now:   now,
	})
	return 1, nil
}

func (repository *fakeRepository) CreateNotificationLog(_ context.Context, input NotificationLog) error {
	repository.notificationLogs = append(repository.notificationLogs, input)
	return nil
}

func (repository *fakeRepository) ClaimDueNotifications(_ context.Context, _ time.Time, limit int, maxAttempts int) ([]DueNotification, error) {
	repository.lastDueNotificationLimit = limit
	repository.lastMaxNotificationAttempts = maxAttempts
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

func (repository *fakeRepository) CreateWaitlistOffer(_ context.Context, _ WaitlistOfferInput) (string, error) {
	repository.offerCount++
	return "waitlist-offer-1", nil
}

func (repository *fakeRepository) GetCalendarSyncTarget(_ context.Context, _ string) (*CalendarSyncTarget, error) {
	return repository.calendarSyncTarget, nil
}

func (repository *fakeRepository) FindWaitlistCandidate(_ context.Context, _ domain.AppointmentPayload) (*domain.WaitlistCandidate, error) {
	return repository.candidate, nil
}

func (repository *fakeRepository) GetCustomerAttendance(_ context.Context, _ string, _ string) (CustomerAttendance, error) {
	return repository.attendance, nil
}

func (repository *fakeRepository) GetReminderSettings(_ context.Context, _ string) (ReminderSettings, error) {
	return repository.reminderSettings, nil
}

func (repository *fakeRepository) MarkWaitlistEntryOffered(_ context.Context, _ string) error {
	return nil
}

func (repository *fakeRepository) MarkCalendarConnectionError(_ context.Context, connectionID string, status string, lastError string) error {
	repository.calendarConnectionErrors = append(repository.calendarConnectionErrors, calendarConnectionError{
		connectionID: connectionID,
		lastError:    lastError,
		status:       status,
	})
	return nil
}

func (repository *fakeRepository) RecalculateBusinessMetricsDaily(
	_ context.Context,
	businessID string,
	metricDate time.Time,
) (BusinessMetricsDailySnapshot, error) {
	snapshot := BusinessMetricsDailySnapshot{
		BusinessID: businessID,
		Date:       metricDate,
	}
	repository.metricsRecalculated = append(repository.metricsRecalculated, snapshot)
	return snapshot, nil
}

func (repository *fakeRepository) RecordCalendarEventSync(_ context.Context, result CalendarEventSyncResult) error {
	repository.calendarSyncResults = append(repository.calendarSyncResults, result)
	return nil
}

func (repository *fakeRepository) UpdateCalendarConnectionToken(_ context.Context, update CalendarConnectionTokenUpdate) error {
	repository.calendarTokenUpdates = append(repository.calendarTokenUpdates, update)
	return nil
}

func (repository *fakeRepository) UpdateCustomerRisk(_ context.Context, risk CustomerRiskSnapshot) error {
	repository.customerRiskUpdates = append(repository.customerRiskUpdates, risk)
	return nil
}

type fakeCalendarClient struct {
	createdEventID  string
	createdEvents   []CalendarEvent
	deletedEventIDs []string
	listedEventIDs  []string
	refreshedTokens []string
	updatedEvents   []CalendarEvent
}

func (client *fakeCalendarClient) CreateEvent(_ context.Context, _ string, event CalendarEvent) (string, error) {
	client.createdEvents = append(client.createdEvents, event)
	return client.createdEventID, nil
}

func (client *fakeCalendarClient) DeleteEvent(_ context.Context, _ string, eventID string) error {
	client.deletedEventIDs = append(client.deletedEventIDs, eventID)
	return nil
}

func (client *fakeCalendarClient) ListEventsByAppointment(_ context.Context, _ string, _ string) ([]string, error) {
	return client.listedEventIDs, nil
}

func (client *fakeCalendarClient) RefreshAccessToken(_ context.Context, refreshToken string) (CalendarToken, error) {
	client.refreshedTokens = append(client.refreshedTokens, refreshToken)
	return CalendarToken{
		AccessToken: "refreshed-access-token",
		ExpiresAt:   time.Now().UTC().Add(time.Hour),
	}, nil
}

func (client *fakeCalendarClient) UpdateEvent(_ context.Context, _ string, _ string, event CalendarEvent) error {
	client.updatedEvents = append(client.updatedEvents, event)
	return nil
}

type fakeTokenCodec struct{}

func (fakeTokenCodec) Decrypt(value string) (string, error) {
	return value, nil
}

func (fakeTokenCodec) Encrypt(value string) (string, error) {
	return value, nil
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

	return domain.Event{
		AggregateID: "appointment-1",
		BusinessID:  "business-1",
		EventID:     "00000000-0000-0000-0000-000000000001",
		OccurredAt:  time.Now().UTC(),
		Payload:     appointmentEventPayload(t, "cancelled_by_customer"),
		Type:        domain.EventAppointmentCancelled,
		Version:     1,
	}
}

func appointmentEventPayload(t *testing.T, status string) json.RawMessage {
	t.Helper()

	payload := appointmentPayload()
	payload.Status = status
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	return body
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
			CompletedAppointments: 0,
			Email:                 "original@example.test",
			ID:                    "customer-1",
			Name:                  "Original Customer",
			NoShowCount:           0,
			RequiresDeposit:       false,
			RiskLevel:             "low",
			RiskScore:             0,
			TotalAppointments:     1,
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
		Status:   "confirmed",
		Timezone: "America/Argentina/Buenos_Aires",
	}

	return payload
}

func stringPointer(value string) *string {
	return &value
}

func timePointer(value time.Time) *time.Time {
	return &value
}

func assertError(message string) error {
	return errors.New(message)
}

func hasOutboxEvent(events []OutboxEventInput, eventType string, routingKey string) bool {
	for _, event := range events {
		if event.Type == eventType && event.RoutingKey == routingKey {
			return true
		}
	}

	return false
}
