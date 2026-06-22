package worker

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
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
)

type Service struct {
	appBaseURL string
	emailFrom  string
	repository Repository
	sender     email.Sender
}

func NewService(repository Repository, sender email.Sender, appBaseURL string, emailFrom string) *Service {
	return &Service{
		appBaseURL: appBaseURL,
		emailFrom:  emailFrom,
		repository: repository,
		sender:     sender,
	}
}

func (service *Service) HandleEvent(ctx context.Context, event domain.Event) error {
	_, err := service.repository.RunOnce(ctx, event.EventID, event.Type, func(ctx context.Context, tx Tx) error {
		switch event.Type {
		case domain.EventAppointmentBooked:
			return service.handleAppointmentBooked(ctx, tx, event.Payload)
		case domain.EventAppointmentCompleted, domain.EventAppointmentMarkedAsNoShow, domain.EventAppointmentMarkedNoShow:
			return service.handleCustomerRiskEvent(ctx, tx, event.Payload, eventOccurredAt(event))
		case domain.EventAppointmentCancelled, domain.EventWaitlistOfferExpired, domain.EventWaitlistOfferRejected:
			return service.handleWaitlistOpportunity(ctx, tx, event.Payload, eventOccurredAt(event))
		case domain.EventWaitlistOfferAccepted, domain.EventWaitlistOfferCreated, domain.EventCustomerRiskScoreUpdated:
			return nil
		default:
			return nil
		}
	})

	return err
}

func (service *Service) SendDueReminders(ctx context.Context, now time.Time) error {
	notifications, err := service.repository.ClaimDueNotifications(ctx, now, dueNotificationBatchSize, maxNotificationAttempts)
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
	_, err := service.repository.CreateAttendanceReviewAlerts(ctx, now, attendanceReviewBatchSize)
	return err
}

func (service *Service) notificationMessage(notification DueNotification) email.Message {
	payload := reminderNotificationPayload{}
	_ = json.Unmarshal(notification.Payload, &payload)
	serviceName := fallbackString(payload.ServiceName, "tu servicio")
	customerName := fallbackString(payload.CustomerName, "cliente")
	startsAt := formatReminderStartTime(payload.StartsAt, notification.DueAt)
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
}

func fallbackString(value string, fallback string) string {
	if value == "" {
		return fallback
	}

	return value
}

func formatReminderStartTime(value string, fallback time.Time) string {
	if value == "" {
		return fallback.Format(time.RFC1123)
	}

	startsAt, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return value
	}

	return startsAt.Format(time.RFC1123)
}

func (service *Service) nextNotificationAttempt(notification DueNotification, now time.Time) *time.Time {
	if notification.Attempts >= maxNotificationAttempts {
		return nil
	}

	backoff := time.Duration(notification.Attempts*notification.Attempts) * time.Minute
	nextAttemptAt := now.Add(backoff)
	return &nextAttemptAt
}

func (service *Service) handleAppointmentBooked(ctx context.Context, tx Tx, payload json.RawMessage) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(payload, &appointment); err != nil {
		return fmt.Errorf("decode appointment booking payload: %w", err)
	}

	settings, err := tx.GetReminderSettings(ctx, appointment.BusinessID)
	if err != nil {
		return fmt.Errorf("get reminder settings: %w", err)
	}
	if !settings.Enabled {
		return service.recalculateBusinessMetrics(ctx, tx, appointment)
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

	return service.recalculateBusinessMetrics(ctx, tx, appointment)
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
			appointment.StartsAt.Format(time.RFC1123),
			acceptURL,
			rejectURL,
			expiresAt.Format(time.RFC1123),
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
