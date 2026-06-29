package worker

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
	"github.com/turnoflow/turnoflow/apps/worker/internal/email"
)

const (
	attendanceReviewBatchSize          = 25
	dueNotificationBatchSize           = 25
	maxNotificationAttempts            = 3
	customerRiskUpdatedRoutingKey      = "customer.risk_score_updated"
	dailyMetricsCalculatedRoutingKey   = "metrics.daily_calculated"
	reminderScheduledRoutingKey        = "reminder.scheduled"
	reminderTemplate24Hours            = "appointment_reminder_24h"
	waitlistCandidateMatchedRoutingKey = "waitlist.candidate_matched"
	waitlistOfferCreatedRoutingKey     = "waitlist.offer_created"
	waitlistOfferTTL                   = 15 * time.Minute
	defaultBusinessTimezone            = "America/Argentina/Buenos_Aires"
)

type Options struct {
	AttendanceReviewBatchSize int
	DueNotificationBatchSize  int
	MaxNotificationAttempts   int
}

type eventHandler func(context.Context, Tx, domain.Event) error

type Service struct {
	appBaseURL string
	calendar   CalendarClient
	codec      TokenCodec
	emailFrom  string
	handlers   map[string]eventHandler
	options    Options
	repository Repository
	sender     email.Sender
}

func NewService(repository Repository, sender email.Sender, appBaseURL string, emailFrom string) *Service {
	return NewServiceWithOptions(repository, sender, appBaseURL, emailFrom, DefaultOptions())
}

func NewServiceWithOptions(repository Repository, sender email.Sender, appBaseURL string, emailFrom string, options Options) *Service {
	service := &Service{
		appBaseURL: appBaseURL,
		calendar:   noopCalendarClient{},
		emailFrom:  emailFrom,
		options:    options.withDefaults(),
		repository: repository,
		sender:     sender,
	}
	service.handlers = service.defaultHandlers()

	return service
}

func (service *Service) WithCalendarSync(calendar CalendarClient, codec TokenCodec) *Service {
	if calendar != nil && codec != nil {
		service.calendar = calendar
		service.codec = codec
	}

	return service
}

func DefaultOptions() Options {
	return Options{
		AttendanceReviewBatchSize: attendanceReviewBatchSize,
		DueNotificationBatchSize:  dueNotificationBatchSize,
		MaxNotificationAttempts:   maxNotificationAttempts,
	}
}

func (service *Service) HandleEvent(ctx context.Context, event domain.Event) error {
	_, err := service.repository.RunOnce(ctx, event.EventID, event.Type, func(ctx context.Context, tx Tx) error {
		handler, ok := service.handlers[event.Type]
		if !ok {
			return nil
		}

		return handler(ctx, tx, event)
	})

	return err
}

func (service *Service) SendDueReminders(ctx context.Context, now time.Time) error {
	notifications, err := service.repository.ClaimDueNotifications(
		ctx,
		now,
		service.options.DueNotificationBatchSize,
		service.options.MaxNotificationAttempts,
	)
	if err != nil {
		return fmt.Errorf("claim due reminders: %w", err)
	}

	for _, notification := range notifications {
		message := service.notificationMessage(notification)
		if err := service.sender.Send(ctx, message); err != nil {
			nextAttemptAt := service.nextNotificationAttempt(notification, now)
			if recordErr := service.repository.MarkNotificationFailed(ctx, notification, err.Error(), nextAttemptAt); recordErr != nil {
				return recordErr
			}
			continue
		}

		if err := service.repository.MarkNotificationSent(ctx, notification, now); err != nil {
			return err
		}
	}

	return nil
}

func (service *Service) ExpireWaitlistOffers(ctx context.Context, now time.Time) error {
	return service.repository.ExpireWaitlistOffers(ctx, now)
}

func (service *Service) ProcessAttendanceAlerts(ctx context.Context, now time.Time) error {
	_, err := service.repository.CreateAttendanceReviewAlerts(ctx, now, service.options.AttendanceReviewBatchSize)
	return err
}

func (service *Service) defaultHandlers() map[string]eventHandler {
	return map[string]eventHandler{
		domain.EventAppointmentBooked: func(ctx context.Context, tx Tx, event domain.Event) error {
			return service.handleAppointmentBooked(ctx, tx, event.Payload)
		},
		domain.EventAppointmentCancelled:      service.handleAppointmentCancelledEvent,
		domain.EventAppointmentCompleted:      service.handleCustomerRiskEventEvent,
		domain.EventAppointmentMarkedAsNoShow: service.handleCustomerRiskEventEvent,
		domain.EventAppointmentMarkedNoShow:   service.handleCustomerRiskEventEvent,
		domain.EventAppointmentRescheduled:    service.handleAppointmentRescheduledEvent,
		domain.EventCustomerRiskScoreUpdated:  ignoreEvent,
		domain.EventWaitlistOfferAccepted:     ignoreEvent,
		domain.EventWaitlistOfferCreated:      ignoreEvent,
		domain.EventWaitlistOfferExpired:      service.handleWaitlistOpportunityEvent,
		domain.EventWaitlistOfferRejected:     service.handleWaitlistOpportunityEvent,
	}
}

func (service *Service) handleAppointmentCancelledEvent(ctx context.Context, tx Tx, event domain.Event) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(event.Payload, &appointment); err != nil {
		return fmt.Errorf("decode appointment cancelled payload: %w", err)
	}

	if err := service.syncCalendarAppointment(ctx, tx, appointment.AppointmentID, "delete"); err != nil {
		return err
	}

	if err := service.sendBusinessCancellationNotification(ctx, tx, appointment); err != nil {
		return err
	}

	return service.handleWaitlistOpportunity(ctx, tx, event.Payload, eventOccurredAt(event))
}

func (service *Service) handleAppointmentRescheduledEvent(ctx context.Context, tx Tx, event domain.Event) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(event.Payload, &appointment); err != nil {
		return fmt.Errorf("decode appointment rescheduled payload: %w", err)
	}

	if err := service.syncCalendarAppointment(ctx, tx, appointment.AppointmentID, "upsert"); err != nil {
		return err
	}

	if err := service.scheduleAppointmentReminder(ctx, tx, appointment); err != nil {
		return err
	}

	if err := service.sendAppointmentRescheduledNotification(ctx, tx, appointment); err != nil {
		return err
	}

	return service.recalculateBusinessMetrics(ctx, tx, appointment)
}

func (service *Service) handleWaitlistOpportunityEvent(ctx context.Context, tx Tx, event domain.Event) error {
	return service.handleWaitlistOpportunity(ctx, tx, event.Payload, eventOccurredAt(event))
}

func (service *Service) handleCustomerRiskEventEvent(ctx context.Context, tx Tx, event domain.Event) error {
	return service.handleCustomerRiskEvent(ctx, tx, event.Payload, eventOccurredAt(event))
}

func ignoreEvent(context.Context, Tx, domain.Event) error {
	return nil
}

func (service *Service) sendBusinessCancellationNotification(
	ctx context.Context,
	tx Tx,
	appointment domain.AppointmentPayload,
) error {
	if appointment.Status != "cancelled_by_business" {
		return nil
	}

	message := email.Message{
		From:    service.emailFrom,
		To:      appointment.Customer.Email,
		Subject: "Tu turno fue cancelado",
		Text: fmt.Sprintf(
			"Hola %s,\n\nTe avisamos que el negocio cancelo tu turno para %s del %s.\n\nSi necesitas otro horario, podes volver a reservar desde TurnoFlow.",
			appointment.Customer.Name,
			appointment.Service.Name,
			formatBusinessDateTime(appointment.StartsAt, appointment.Timezone),
		),
	}

	logInput := NotificationLog{
		AppointmentID: &appointment.AppointmentID,
		BusinessID:    appointment.BusinessID,
		Email:         appointment.Customer.Email,
		Status:        NotificationSent,
		Template:      "appointment_cancelled_by_business",
	}

	if err := service.sender.Send(ctx, message); err != nil {
		errorMessage := err.Error()
		logInput.LastError = &errorMessage
		logInput.Status = NotificationFailed
	}

	return tx.CreateNotificationLog(ctx, logInput)
}

func (service *Service) sendAppointmentRescheduledNotification(
	ctx context.Context,
	tx Tx,
	appointment domain.AppointmentPayload,
) error {
	previousLine := ""
	if !appointment.PreviousStartsAt.IsZero() {
		previousLine = fmt.Sprintf(
			"\nHorario anterior: %s",
			formatBusinessDateTime(appointment.PreviousStartsAt, appointment.Timezone),
		)
	}

	manageURL := fmt.Sprintf("%s/cancel/%s?token=%s", service.appBaseURL, appointment.AppointmentID, appointment.CancellationToken)
	message := email.Message{
		From:    service.emailFrom,
		To:      appointment.Customer.Email,
		Subject: "Tu turno fue reprogramado",
		Text: fmt.Sprintf(
			"Hola %s,\n\nTu turno para %s fue reprogramado.\nNuevo horario: %s%s\n\nSi no podes asistir, podes gestionar tu turno desde: %s",
			appointment.Customer.Name,
			appointment.Service.Name,
			formatBusinessDateTime(appointment.StartsAt, appointment.Timezone),
			previousLine,
			manageURL,
		),
	}

	logInput := NotificationLog{
		AppointmentID: &appointment.AppointmentID,
		BusinessID:    appointment.BusinessID,
		Email:         appointment.Customer.Email,
		Status:        NotificationSent,
		Template:      "appointment_rescheduled",
	}

	if err := service.sender.Send(ctx, message); err != nil {
		errorMessage := err.Error()
		logInput.LastError = &errorMessage
		logInput.Status = NotificationFailed
	}

	return tx.CreateNotificationLog(ctx, logInput)
}

func (service *Service) notificationMessage(notification DueNotification) email.Message {
	payload := reminderNotificationPayload{}
	_ = json.Unmarshal(notification.Payload, &payload)
	serviceName := fallbackString(payload.ServiceName, "tu servicio")
	customerName := fallbackString(payload.CustomerName, "cliente")
	timezone := fallbackString(payload.Timezone, notification.Timezone)
	startsAt := formatReminderStartTime(payload.StartsAt, notification.DueAt, timezone)
	cancelLine := ""
	if payload.CancelURL != "" {
		cancelLine = fmt.Sprintf("\n\nSi no podes asistir, podes cancelar tu turno desde: %s", payload.CancelURL)
	}

	return email.Message{
		From:    service.emailFrom,
		To:      notification.Email,
		Subject: "Recordatorio de turno",
		Text: fmt.Sprintf(
			"Hola %s,\n\nTe recordamos tu turno para %s el %s.\n\nGracias por reservar con TurnoFlow.%s",
			customerName,
			serviceName,
			startsAt,
			cancelLine,
		),
	}
}

type reminderNotificationPayload struct {
	CancelURL    string `json:"cancelUrl"`
	CustomerName string `json:"customerName"`
	ServiceName  string `json:"serviceName"`
	StartsAt     string `json:"startsAt"`
	Timezone     string `json:"timezone"`
}

func fallbackString(value string, fallback string) string {
	if value == "" {
		return fallback
	}

	return value
}

func formatReminderStartTime(value string, fallback time.Time, timezone string) string {
	if value == "" {
		return formatBusinessDateTime(fallback, timezone)
	}

	startsAt, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return value
	}

	return formatBusinessDateTime(startsAt, timezone)
}

func formatBusinessDateTime(value time.Time, timezone string) string {
	timezone = fallbackString(timezone, defaultBusinessTimezone)
	location, err := time.LoadLocation(timezone)
	if err != nil {
		timezone = defaultBusinessTimezone
		location, err = time.LoadLocation(timezone)
		if err != nil {
			return value.UTC().Format("02/01/2006 15:04 UTC")
		}
	}

	return fmt.Sprintf("%s (%s)", value.In(location).Format("02/01/2006 15:04"), timezone)
}

func (service *Service) nextNotificationAttempt(notification DueNotification, now time.Time) *time.Time {
	if notification.Attempts >= service.options.MaxNotificationAttempts {
		return nil
	}

	backoff := time.Duration(notification.Attempts*notification.Attempts) * time.Minute
	nextAttemptAt := now.Add(backoff)
	return &nextAttemptAt
}

func (options Options) withDefaults() Options {
	defaults := DefaultOptions()
	if options.AttendanceReviewBatchSize <= 0 {
		options.AttendanceReviewBatchSize = defaults.AttendanceReviewBatchSize
	}
	if options.DueNotificationBatchSize <= 0 {
		options.DueNotificationBatchSize = defaults.DueNotificationBatchSize
	}
	if options.MaxNotificationAttempts <= 0 {
		options.MaxNotificationAttempts = defaults.MaxNotificationAttempts
	}

	return options
}

func (service *Service) handleAppointmentBooked(ctx context.Context, tx Tx, payload json.RawMessage) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(payload, &appointment); err != nil {
		return fmt.Errorf("decode appointment booking payload: %w", err)
	}

	if err := service.scheduleAppointmentReminder(ctx, tx, appointment); err != nil {
		return err
	}

	if err := service.syncCalendarAppointment(ctx, tx, appointment.AppointmentID, "upsert"); err != nil {
		return err
	}

	if err := service.sendAppointmentBookedNotification(ctx, tx, appointment); err != nil {
		return err
	}

	return service.recalculateBusinessMetrics(ctx, tx, appointment)
}

func (service *Service) sendAppointmentBookedNotification(
	ctx context.Context,
	tx Tx,
	appointment domain.AppointmentPayload,
) error {
	manageURL := fmt.Sprintf("%s/cancel/%s?token=%s", service.appBaseURL, appointment.AppointmentID, appointment.CancellationToken)
	message := email.Message{
		From:    service.emailFrom,
		To:      appointment.Customer.Email,
		Subject: "Tu turno fue confirmado",
		Text: fmt.Sprintf(
			"Hola %s,\n\nTu turno para %s quedo confirmado para %s.\n\nSi necesitas cancelar o reprogramar, podes gestionarlo desde: %s",
			appointment.Customer.Name,
			appointment.Service.Name,
			formatBusinessDateTime(appointment.StartsAt, appointment.Timezone),
			manageURL,
		),
	}

	logInput := NotificationLog{
		AppointmentID: &appointment.AppointmentID,
		BusinessID:    appointment.BusinessID,
		Email:         appointment.Customer.Email,
		Status:        NotificationSent,
		Template:      "appointment_booked_confirmation",
	}

	if err := service.sender.Send(ctx, message); err != nil {
		errorMessage := err.Error()
		logInput.LastError = &errorMessage
		logInput.Status = NotificationFailed
	}

	return tx.CreateNotificationLog(ctx, logInput)
}

func (service *Service) scheduleAppointmentReminder(ctx context.Context, tx Tx, appointment domain.AppointmentPayload) error {
	settings, err := tx.GetReminderSettings(ctx, appointment.BusinessID)
	if err != nil {
		return fmt.Errorf("get reminder settings: %w", err)
	}
	if !settings.Enabled {
		return nil
	}

	cancelURL := fmt.Sprintf("%s/cancel/%s?token=%s", service.appBaseURL, appointment.AppointmentID, appointment.CancellationToken)
	dueAt := appointment.StartsAt.Add(-time.Duration(settings.OffsetMinutes) * time.Minute)
	notificationPayload, err := json.Marshal(map[string]any{
		"appointmentId": appointment.AppointmentID,
		"cancelUrl":     cancelURL,
		"customerId":    appointment.Customer.ID,
		"customerName":  appointment.Customer.Name,
		"serviceId":     appointment.Service.ID,
		"serviceName":   appointment.Service.Name,
		"startsAt":      appointment.StartsAt.Format(time.RFC3339),
		"timezone":      fallbackString(appointment.Timezone, defaultBusinessTimezone),
	})
	if err != nil {
		return fmt.Errorf("encode reminder notification payload: %w", err)
	}

	notificationID, err := tx.CreateScheduledNotification(ctx, ScheduledNotificationInput{
		AppointmentID: appointment.AppointmentID,
		BusinessID:    appointment.BusinessID,
		Channel:       settings.Channel,
		CustomerID:    appointment.Customer.ID,
		DueAt:         dueAt,
		Email:         appointment.Customer.Email,
		Payload:       notificationPayload,
		Template:      settings.Template,
	})
	if err != nil {
		return fmt.Errorf("create scheduled reminder: %w", err)
	}

	eventPayload, err := json.Marshal(map[string]any{
		"appointmentId":  appointment.AppointmentID,
		"businessId":     appointment.BusinessID,
		"channel":        settings.Channel,
		"customerEmail":  appointment.Customer.Email,
		"customerId":     appointment.Customer.ID,
		"dueAt":          dueAt.Format(time.RFC3339),
		"notificationId": notificationID,
		"template":       settings.Template,
	})
	if err != nil {
		return fmt.Errorf("encode reminder scheduled event payload: %w", err)
	}

	if err := tx.CreateOutboxEvent(ctx, OutboxEventInput{
		AggregateID: appointment.AppointmentID,
		BusinessID:  appointment.BusinessID,
		Payload:     eventPayload,
		RoutingKey:  reminderScheduledRoutingKey,
		Type:        domain.EventReminderScheduled,
		Version:     1,
	}); err != nil {
		return fmt.Errorf("create reminder scheduled outbox event: %w", err)
	}

	return nil
}

func (service *Service) syncCalendarEvent(ctx context.Context, tx Tx, payload json.RawMessage, action string) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(payload, &appointment); err != nil {
		return fmt.Errorf("decode calendar sync payload: %w", err)
	}

	return service.syncCalendarAppointment(ctx, tx, appointment.AppointmentID, action)
}

func (service *Service) syncCalendarAppointment(ctx context.Context, tx Tx, appointmentID string, action string) error {
	if isNoopCalendarClient(service.calendar) || service.codec == nil {
		return nil
	}

	target, err := tx.GetCalendarSyncTarget(ctx, appointmentID)
	if err != nil {
		return fmt.Errorf("get calendar sync target: %w", err)
	}
	if target == nil || target.Connection == nil {
		return nil
	}

	accessToken, err := service.accessToken(ctx, tx, target.Connection)
	if err != nil {
		return service.recordCalendarFailure(ctx, tx, target, err)
	}

	switch action {
	case "delete":
		return service.deleteCalendarEvent(ctx, tx, target, accessToken)
	default:
		return service.upsertCalendarEvent(ctx, tx, target, accessToken)
	}
}

func (service *Service) upsertCalendarEvent(ctx context.Context, tx Tx, target *CalendarSyncTarget, accessToken string) error {
	event := calendarEventFromAppointment(target.Appointment)
	if target.GoogleEventID == nil || *target.GoogleEventID == "" {
		eventIDs, err := service.calendar.ListEventsByAppointment(ctx, accessToken, target.Appointment.AppointmentID)
		if err != nil {
			return service.recordCalendarFailure(ctx, tx, target, err)
		}
		if len(eventIDs) > 0 {
			primaryEventID := eventIDs[0]
			if err := service.calendar.UpdateEvent(ctx, accessToken, primaryEventID, event); err != nil {
				return service.recordCalendarFailure(ctx, tx, target, err)
			}
			service.deleteDuplicateCalendarEvents(ctx, accessToken, eventIDs[1:])

			return service.recordCalendarSuccess(ctx, tx, target, &primaryEventID, "synced")
		}

		eventID, err := service.calendar.CreateEvent(ctx, accessToken, event)
		if err != nil {
			return service.recordCalendarFailure(ctx, tx, target, err)
		}

		return service.recordCalendarSuccess(ctx, tx, target, &eventID, "synced")
	}

	if err := service.calendar.UpdateEvent(ctx, accessToken, *target.GoogleEventID, event); err != nil {
		var calendarErr CalendarError
		if errors.As(err, &calendarErr) && calendarErr.StatusCode == 404 {
			eventID, createErr := service.calendar.CreateEvent(ctx, accessToken, event)
			if createErr != nil {
				return service.recordCalendarFailure(ctx, tx, target, createErr)
			}

			return service.recordCalendarSuccess(ctx, tx, target, &eventID, "synced")
		}

		return service.recordCalendarFailure(ctx, tx, target, err)
	}
	eventIDs, err := service.calendar.ListEventsByAppointment(ctx, accessToken, target.Appointment.AppointmentID)
	if err == nil {
		duplicates := make([]string, 0, len(eventIDs))
		for _, eventID := range eventIDs {
			if eventID != *target.GoogleEventID {
				duplicates = append(duplicates, eventID)
			}
		}
		service.deleteDuplicateCalendarEvents(ctx, accessToken, duplicates)
	}

	return service.recordCalendarSuccess(ctx, tx, target, target.GoogleEventID, "synced")
}

func (service *Service) deleteDuplicateCalendarEvents(ctx context.Context, accessToken string, eventIDs []string) {
	for _, eventID := range eventIDs {
		_ = service.calendar.DeleteEvent(ctx, accessToken, eventID)
	}
}

func (service *Service) deleteCalendarEvent(ctx context.Context, tx Tx, target *CalendarSyncTarget, accessToken string) error {
	if target.GoogleEventID != nil && *target.GoogleEventID != "" {
		if err := service.calendar.DeleteEvent(ctx, accessToken, *target.GoogleEventID); err != nil {
			return service.recordCalendarFailure(ctx, tx, target, err)
		}
	}

	return service.recordCalendarSuccess(ctx, tx, target, target.GoogleEventID, "deleted")
}

func (service *Service) accessToken(ctx context.Context, tx Tx, connection *CalendarConnection) (string, error) {
	if connection.AccessTokenEncrypted != nil && connection.ExpiresAt != nil && connection.ExpiresAt.After(time.Now().UTC().Add(2*time.Minute)) {
		return service.codec.Decrypt(*connection.AccessTokenEncrypted)
	}

	if connection.RefreshTokenEncrypted == nil {
		return "", fmt.Errorf("calendar refresh token is missing")
	}

	refreshToken, err := service.codec.Decrypt(*connection.RefreshTokenEncrypted)
	if err != nil {
		return "", err
	}

	token, err := service.calendar.RefreshAccessToken(ctx, refreshToken)
	if err != nil {
		return "", err
	}

	encryptedAccessToken, err := service.codec.Encrypt(token.AccessToken)
	if err != nil {
		return "", err
	}

	if err := tx.UpdateCalendarConnectionToken(ctx, CalendarConnectionTokenUpdate{
		AccessTokenEncrypted: encryptedAccessToken,
		ConnectionID:         connection.ID,
		ExpiresAt:            token.ExpiresAt,
	}); err != nil {
		return "", err
	}

	return token.AccessToken, nil
}

func (service *Service) recordCalendarSuccess(ctx context.Context, tx Tx, target *CalendarSyncTarget, googleEventID *string, status string) error {
	return tx.RecordCalendarEventSync(ctx, CalendarEventSyncResult{
		AppointmentID:        target.Appointment.AppointmentID,
		BusinessID:           target.Appointment.BusinessID,
		CalendarConnectionID: target.Connection.ID,
		GoogleEventID:        googleEventID,
		Status:               status,
	})
}

func (service *Service) recordCalendarFailure(ctx context.Context, tx Tx, target *CalendarSyncTarget, err error) error {
	lastError := err.Error()
	var calendarErr CalendarError
	if errors.As(err, &calendarErr) {
		if calendarErr.IsExpiredGrant() {
			_ = tx.MarkCalendarConnectionError(ctx, target.Connection.ID, "expired", lastError)
		} else if calendarErr.IsPermanentAuthFailure() {
			_ = tx.MarkCalendarConnectionError(ctx, target.Connection.ID, "error", lastError)
		}
	}

	return tx.RecordCalendarEventSync(ctx, CalendarEventSyncResult{
		AppointmentID:        target.Appointment.AppointmentID,
		BusinessID:           target.Appointment.BusinessID,
		CalendarConnectionID: target.Connection.ID,
		GoogleEventID:        target.GoogleEventID,
		LastError:            &lastError,
		Status:               "failed",
	})
}

func calendarEventFromAppointment(appointment CalendarAppointment) CalendarEvent {
	phone := ""
	if appointment.CustomerPhone != nil {
		phone = *appointment.CustomerPhone
	}

	description := strings.Join([]string{
		fmt.Sprintf("Cliente: %s", appointment.CustomerName),
		fmt.Sprintf("Email: %s", appointment.CustomerEmail),
		fmt.Sprintf("Telefono: %s", fallbackString(phone, "No informado")),
		fmt.Sprintf("Profesional: %s", appointment.StaffName),
		fmt.Sprintf("Turno ID: %s", appointment.AppointmentID),
		"Origen: TurnoFlow",
	}, "\n")

	return CalendarEvent{
		AppointmentID: appointment.AppointmentID,
		Description:   description,
		EndsAt:        appointment.EndsAt,
		StartsAt:      appointment.StartsAt,
		Summary:       fmt.Sprintf("%s - %s", appointment.ServiceName, appointment.CustomerName),
		Timezone:      fallbackString(appointment.Timezone, "America/Argentina/Buenos_Aires"),
	}
}

func (service *Service) handleWaitlistOpportunity(ctx context.Context, tx Tx, payload json.RawMessage, now time.Time) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(payload, &appointment); err != nil {
		return fmt.Errorf("decode waitlist opportunity payload: %w", err)
	}

	candidate, err := tx.FindWaitlistCandidate(ctx, appointment)
	if err != nil {
		return fmt.Errorf("find waitlist candidate: %w", err)
	}
	if candidate == nil {
		return service.recalculateBusinessMetrics(ctx, tx, appointment)
	}

	token, err := createToken()
	if err != nil {
		return err
	}

	expiresAt := now.UTC().Add(waitlistOfferTTL)
	offerID, err := tx.CreateWaitlistOffer(ctx, WaitlistOfferInput{
		AppointmentID:   appointment.AppointmentID,
		ExpiresAt:       expiresAt,
		Token:           token,
		WaitlistEntryID: candidate.EntryID,
	})
	if err != nil {
		return fmt.Errorf("create waitlist offer: %w", err)
	}
	if err := tx.MarkWaitlistEntryOffered(ctx, candidate.EntryID); err != nil {
		return fmt.Errorf("mark waitlist entry offered: %w", err)
	}

	acceptURL := fmt.Sprintf("%s/waitlist-offers/%s/accept", service.appBaseURL, token)
	rejectURL := fmt.Sprintf("%s/waitlist-offers/%s/reject", service.appBaseURL, token)
	eventPayload, err := waitlistOfferCreatedPayload(appointment, candidate, offerID, token, acceptURL, rejectURL, expiresAt)
	if err != nil {
		return err
	}
	if err := tx.CreateOutboxEvent(ctx, OutboxEventInput{
		AggregateID: candidate.EntryID,
		BusinessID:  appointment.BusinessID,
		Payload:     eventPayload,
		RoutingKey:  waitlistCandidateMatchedRoutingKey,
		Type:        domain.EventWaitlistCandidateMatched,
		Version:     1,
	}); err != nil {
		return fmt.Errorf("create waitlist candidate matched outbox event: %w", err)
	}
	if err := tx.CreateOutboxEvent(ctx, OutboxEventInput{
		AggregateID: offerID,
		BusinessID:  appointment.BusinessID,
		Payload:     eventPayload,
		RoutingKey:  waitlistOfferCreatedRoutingKey,
		Type:        domain.EventWaitlistOfferCreated,
		Version:     1,
	}); err != nil {
		return fmt.Errorf("create waitlist offer outbox event: %w", err)
	}

	sendErr := service.sender.Send(ctx, email.Message{
		From:    service.emailFrom,
		To:      candidate.CustomerEmail,
		Subject: fmt.Sprintf("Se libero un turno para %s", appointment.Service.Name),
		Text: fmt.Sprintf(
			"Hola %s, se libero un turno para %s el %s. Podes aceptarlo desde %s o rechazarlo desde %s. La oferta vence a las %s.",
			candidate.CustomerName,
			appointment.Service.Name,
			formatBusinessDateTime(appointment.StartsAt, appointment.Timezone),
			acceptURL,
			rejectURL,
			formatBusinessDateTime(expiresAt, appointment.Timezone),
		),
	})

	logInput := NotificationLog{
		AppointmentID:   &appointment.AppointmentID,
		BusinessID:      appointment.BusinessID,
		Email:           candidate.CustomerEmail,
		Status:          NotificationSent,
		Template:        "waitlist_offer",
		WaitlistEntryID: &candidate.EntryID,
	}
	if sendErr != nil {
		errorMessage := sendErr.Error()
		logInput.LastError = &errorMessage
		logInput.Status = NotificationFailed
	}

	if err := tx.CreateNotificationLog(ctx, logInput); err != nil {
		return err
	}

	return service.recalculateBusinessMetrics(ctx, tx, appointment)
}

func (service *Service) handleCustomerRiskEvent(ctx context.Context, tx Tx, payload json.RawMessage, now time.Time) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(payload, &appointment); err != nil {
		return fmt.Errorf("decode customer risk payload: %w", err)
	}

	attendance, err := tx.GetCustomerAttendance(ctx, appointment.BusinessID, appointment.Customer.ID)
	if err != nil {
		return fmt.Errorf("get customer attendance: %w", err)
	}

	risk := calculateCustomerRisk(attendance, now)
	if err := tx.UpdateCustomerRisk(ctx, risk); err != nil {
		return fmt.Errorf("update customer risk: %w", err)
	}

	eventPayload, err := json.Marshal(map[string]any{
		"businessId":            risk.BusinessID,
		"completedAppointments": risk.CompletedAppointments,
		"customerId":            risk.CustomerID,
		"lastCalculatedAt":      risk.LastCalculatedAt.Format(time.RFC3339),
		"noShowCount":           risk.NoShowCount,
		"requiresDeposit":       risk.RequiresDeposit,
		"riskLevel":             risk.RiskLevel,
		"riskScore":             risk.RiskScore,
		"totalAppointments":     risk.TotalAppointments,
	})
	if err != nil {
		return fmt.Errorf("encode customer risk payload: %w", err)
	}

	if err := tx.CreateOutboxEvent(ctx, OutboxEventInput{
		AggregateID: risk.CustomerID,
		BusinessID:  risk.BusinessID,
		Payload:     eventPayload,
		RoutingKey:  customerRiskUpdatedRoutingKey,
		Type:        domain.EventCustomerRiskScoreUpdated,
		Version:     1,
	}); err != nil {
		return fmt.Errorf("create customer risk outbox event: %w", err)
	}

	return service.recalculateBusinessMetrics(ctx, tx, appointment)
}

func eventOccurredAt(event domain.Event) time.Time {
	if event.OccurredAt.IsZero() {
		return time.Now().UTC()
	}

	return event.OccurredAt.UTC()
}

func waitlistOfferCreatedPayload(
	appointment domain.AppointmentPayload,
	candidate *domain.WaitlistCandidate,
	offerID string,
	token string,
	acceptURL string,
	rejectURL string,
	expiresAt time.Time,
) ([]byte, error) {
	payload := map[string]any{
		"acceptUrl":       acceptURL,
		"appointmentId":   appointment.AppointmentID,
		"businessId":      appointment.BusinessID,
		"customerEmail":   candidate.CustomerEmail,
		"customerName":    candidate.CustomerName,
		"expiresAt":       expiresAt.Format(time.RFC3339),
		"rejectUrl":       rejectURL,
		"serviceId":       appointment.Service.ID,
		"serviceName":     appointment.Service.Name,
		"startsAt":        appointment.StartsAt.Format(time.RFC3339),
		"token":           token,
		"waitlistEntryId": candidate.EntryID,
		"waitlistOfferId": offerID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode waitlist offer created event payload: %w", err)
	}

	return body, nil
}

func createToken() (string, error) {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("create public token: %w", err)
	}

	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func calculateCustomerRisk(attendance CustomerAttendance, now time.Time) CustomerRiskSnapshot {
	terminalAppointments := attendance.CompletedAppointments + attendance.NoShowCount
	absenceRate := 0.0
	if terminalAppointments > 0 {
		absenceRate = float64(attendance.NoShowCount) / float64(terminalAppointments)
	}

	riskScore := attendance.NoShowCount * 30
	riskScore += int(absenceRate*40 + 0.5)
	if riskScore > 100 {
		riskScore = 100
	}

	riskLevel := "low"
	switch {
	case attendance.NoShowCount >= 3:
		riskLevel = "high"
	case attendance.NoShowCount >= 1:
		riskLevel = "medium"
	}

	return CustomerRiskSnapshot{
		BusinessID:            attendance.BusinessID,
		CompletedAppointments: attendance.CompletedAppointments,
		CustomerID:            attendance.CustomerID,
		LastCalculatedAt:      now.UTC(),
		NoShowCount:           attendance.NoShowCount,
		RequiresDeposit:       terminalAppointments > 0 && absenceRate > 0.5,
		RiskLevel:             riskLevel,
		RiskScore:             riskScore,
		TotalAppointments:     attendance.TotalAppointments,
	}
}

func (service *Service) recalculateBusinessMetrics(ctx context.Context, tx Tx, appointment domain.AppointmentPayload) error {
	snapshot, err := tx.RecalculateBusinessMetricsDaily(ctx, appointment.BusinessID, appointment.StartsAt)
	if err != nil {
		return fmt.Errorf("recalculate business metrics: %w", err)
	}

	payload, err := json.Marshal(map[string]any{
		"activeAppointments":    snapshot.ActiveAppointments,
		"businessId":            snapshot.BusinessID,
		"cancelledAppointments": snapshot.CancelledAppointments,
		"completedAppointments": snapshot.CompletedAppointments,
		"date":                  snapshot.Date.Format("2006-01-02"),
		"estimatedRevenueCents": snapshot.EstimatedRevenueCents,
		"lostRevenueCents":      snapshot.LostRevenueCents,
		"noShowAppointments":    snapshot.NoShowAppointments,
		"totalAppointments":     snapshot.TotalAppointments,
	})
	if err != nil {
		return fmt.Errorf("encode daily metrics payload: %w", err)
	}

	if err := tx.CreateOutboxEvent(ctx, OutboxEventInput{
		AggregateID: appointment.BusinessID,
		BusinessID:  appointment.BusinessID,
		Payload:     payload,
		RoutingKey:  dailyMetricsCalculatedRoutingKey,
		Type:        domain.EventDailyMetricsCalculated,
		Version:     1,
	}); err != nil {
		return fmt.Errorf("create daily metrics outbox event: %w", err)
	}

	return nil
}
