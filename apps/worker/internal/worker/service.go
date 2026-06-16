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
		case domain.EventAppointmentCancelled:
			return service.handleAppointmentCancelled(ctx, tx, event.Payload)
		case domain.EventAppointmentCreated, domain.EventAppointmentMarkedNoShow, domain.EventWaitlistOfferCreated:
			return nil
		default:
			return nil
		}
	})

	return err
}

func (service *Service) SendDueReminders(ctx context.Context, now time.Time) error {
	from := now.Add(23*time.Hour + 55*time.Minute)
	until := now.Add(24*time.Hour + 5*time.Minute)
	appointments, err := service.repository.FindDueReminderAppointments(ctx, from, until)
	if err != nil {
		return fmt.Errorf("find due reminder appointments: %w", err)
	}

	for _, appointment := range appointments {
		cancelURL := fmt.Sprintf("%s/cancel/%s?token=%s", service.appBaseURL, appointment.AppointmentID, appointment.CancellationToken)
		message := email.Message{
			From:    service.emailFrom,
			To:      appointment.CustomerEmail,
			Subject: fmt.Sprintf("Recordatorio de turno: %s", appointment.ServiceName),
			Text: fmt.Sprintf(
				"Hola %s, te recordamos tu turno para %s el %s. Si no podes asistir, cancelalo desde %s",
				appointment.CustomerName,
				appointment.ServiceName,
				appointment.StartsAt.Format(time.RFC1123),
				cancelURL,
			),
		}

		sendErr := service.sender.Send(ctx, message)
		logInput := NotificationLog{
			AppointmentID: &appointment.AppointmentID,
			BusinessID:    appointment.BusinessID,
			Email:         appointment.CustomerEmail,
			Status:        NotificationSent,
			Template:      "appointment_reminder_24h",
		}
		if sendErr != nil {
			errorMessage := sendErr.Error()
			logInput.LastError = &errorMessage
			logInput.Status = NotificationFailed
		}
		if err := service.repository.CreateNotificationLog(ctx, logInput); err != nil {
			return err
		}
	}

	return nil
}

func (service *Service) ExpireWaitlistOffers(ctx context.Context, now time.Time) error {
	return service.repository.ExpireWaitlistOffers(ctx, now)
}

func (service *Service) handleAppointmentCancelled(ctx context.Context, tx Tx, payload json.RawMessage) error {
	var appointment domain.AppointmentPayload
	if err := json.Unmarshal(payload, &appointment); err != nil {
		return fmt.Errorf("decode appointment cancellation payload: %w", err)
	}

	candidate, err := tx.FindWaitlistCandidate(ctx, appointment)
	if err != nil {
		return fmt.Errorf("find waitlist candidate: %w", err)
	}
	if candidate == nil {
		return nil
	}

	token, err := createToken()
	if err != nil {
		return err
	}

	expiresAt := time.Now().UTC().Add(15 * time.Minute)
	if err := tx.CreateWaitlistOffer(ctx, WaitlistOfferInput{
		AppointmentID:   appointment.AppointmentID,
		ExpiresAt:       expiresAt,
		Token:           token,
		WaitlistEntryID: candidate.EntryID,
	}); err != nil {
		return fmt.Errorf("create waitlist offer: %w", err)
	}
	if err := tx.MarkWaitlistEntryOffered(ctx, candidate.EntryID); err != nil {
		return fmt.Errorf("mark waitlist entry offered: %w", err)
	}

	acceptURL := fmt.Sprintf("%s/waitlist-offers/%s/accept", service.appBaseURL, token)
	sendErr := service.sender.Send(ctx, email.Message{
		From:    service.emailFrom,
		To:      candidate.CustomerEmail,
		Subject: fmt.Sprintf("Se libero un turno para %s", appointment.Service.Name),
		Text: fmt.Sprintf(
			"Hola %s, se libero un turno para %s el %s. Podes aceptarlo desde %s. La oferta vence a las %s.",
			candidate.CustomerName,
			appointment.Service.Name,
			appointment.StartsAt.Format(time.RFC1123),
			acceptURL,
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

	return tx.CreateNotificationLog(ctx, logInput)
}

func createToken() (string, error) {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("create public token: %w", err)
	}

	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
