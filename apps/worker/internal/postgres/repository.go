package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
	worker "github.com/turnoflow/turnoflow/apps/worker/internal/worker"
)

type Repository struct {
	pool *pgxpool.Pool
}

type txRepository struct {
	tx pgx.Tx
}

func NewRepository(ctx context.Context, databaseURL string) (*Repository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create postgres pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return &Repository{pool: pool}, nil
}

func (repository *Repository) Close() {
	repository.pool.Close()
}

func (repository *Repository) RunOnce(
	ctx context.Context,
	eventID string,
	eventType string,
	fn func(context.Context, worker.Tx) error,
) (bool, error) {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin idempotent transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	var insertedEventID string
	err = tx.QueryRow(ctx, `
		INSERT INTO processed_events (event_id, type)
		VALUES ($1, $2)
		ON CONFLICT (event_id) DO NOTHING
		RETURNING event_id
	`, eventID, eventType).Scan(&insertedEventID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("insert processed event: %w", err)
	}

	if err := fn(ctx, &txRepository{tx: tx}); err != nil {
		return false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit idempotent transaction: %w", err)
	}

	return true, nil
}

func (repository *Repository) CreateNotificationLog(ctx context.Context, input worker.NotificationLog) error {
	_, err := repository.pool.Exec(
		ctx,
		notificationLogSQL(),
		input.BusinessID,
		input.NotificationID,
		input.AppointmentID,
		input.WaitlistEntryID,
		input.Email,
		input.Template,
		string(input.Status),
		notificationLogAttempts(input.Attempts),
		input.LastError,
	)
	if err != nil {
		return fmt.Errorf("create notification log: %w", err)
	}

	return nil
}

func (repository *Repository) ExpireWaitlistOffers(ctx context.Context, now time.Time) error {
	_, err := repository.pool.Exec(ctx, `
		WITH expired AS (
			UPDATE waitlist_offers
			SET status = 'expired', updated_at = CURRENT_TIMESTAMP
			WHERE status = 'pending' AND expires_at <= $1
			RETURNING id, waitlist_entry_id, appointment_id
		),
		reset_entries AS (
			UPDATE waitlist_entries
			SET status = 'waiting', updated_at = CURRENT_TIMESTAMP
			WHERE status = 'offered' AND id IN (SELECT waitlist_entry_id FROM expired)
			RETURNING id
		),
		expired_appointments AS (
			SELECT DISTINCT ON (appointment_id) id, waitlist_entry_id, appointment_id
			FROM expired
			ORDER BY appointment_id, id
		)
		INSERT INTO outbox_events (
			type,
			version,
			business_id,
			aggregate_id,
			routing_key,
			payload
		)
		SELECT
			'WaitlistOfferExpired',
			1,
			a.business_id,
			a.id,
			'waitlist.offer_expired',
			jsonb_build_object(
				'appointmentId', a.id,
				'businessId', a.business_id,
				'cancellationToken', a.cancellation_token,
				'customer', jsonb_build_object(
					'email', c.email,
					'id', c.id,
					'name', c.name,
					'noShowCount', c.no_show_count,
					'phone', c.phone
				),
				'endsAt', a.ends_at,
				'service', jsonb_build_object(
					'durationMinutes', s.duration_minutes,
					'id', s.id,
					'name', s.name,
					'priceCents', s.price_cents
				),
				'staffMember', jsonb_build_object(
					'id', sm.id,
					'name', sm.name
				),
				'startsAt', a.starts_at,
				'status', a.status::text,
				'waitlistEntryId', expired_appointments.waitlist_entry_id,
				'waitlistOfferId', expired_appointments.id,
				'waitlistOfferStatus', 'expired'
			)
		FROM expired_appointments
		JOIN appointments a ON a.id = expired_appointments.appointment_id
		JOIN customers c ON c.id = a.customer_id
		JOIN services s ON s.id = a.service_id
		JOIN staff_members sm ON sm.id = a.staff_member_id
	`, now)
	if err != nil {
		return fmt.Errorf("expire waitlist offers: %w", err)
	}

	return nil
}

func (repository *Repository) ClaimDueNotifications(ctx context.Context, now time.Time, limit int, maxAttempts int) ([]worker.DueNotification, error) {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin due notification claim: %w", err)
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	rows, err := tx.Query(ctx, `
		WITH due AS (
			SELECT id
			FROM notifications
			WHERE status IN ('pending', 'failed')
				AND next_attempt_at <= $1
				AND attempts < $2
			ORDER BY next_attempt_at ASC, created_at ASC
			LIMIT $3
			FOR UPDATE SKIP LOCKED
		)
		UPDATE notifications n
		SET
			attempts = n.attempts + 1,
			next_attempt_at = $1 + INTERVAL '5 minutes',
			updated_at = CURRENT_TIMESTAMP
		FROM due
		WHERE n.id = due.id
		RETURNING
			n.id,
			n.business_id,
			n.appointment_id,
			n.channel,
			n.email,
			n.template,
			n.due_at,
			n.attempts,
			n.payload
	`, now, maxAttempts, limit)
	if err != nil {
		return nil, fmt.Errorf("claim due notifications: %w", err)
	}
	defer rows.Close()

	notifications := make([]worker.DueNotification, 0)
	for rows.Next() {
		var notification worker.DueNotification
		if err := rows.Scan(
			&notification.ID,
			&notification.BusinessID,
			&notification.AppointmentID,
			&notification.Channel,
			&notification.Email,
			&notification.Template,
			&notification.DueAt,
			&notification.Attempts,
			&notification.Payload,
		); err != nil {
			return nil, fmt.Errorf("scan due notification: %w", err)
		}
		notifications = append(notifications, notification)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate due notifications: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit due notification claim: %w", err)
	}

	return notifications, nil
}

func (repository *Repository) MarkNotificationSent(ctx context.Context, notification worker.DueNotification, sentAt time.Time) error {
	payload, err := notificationEventPayload(notification, nil)
	if err != nil {
		return err
	}

	return repository.recordNotificationResult(ctx, notification, worker.NotificationSent, nil, &sentAt, nil, worker.OutboxEventInput{
		AggregateID: notification.ID,
		BusinessID:  notification.BusinessID,
		Payload:     payload,
		RoutingKey:  "reminder.sent",
		Type:        domain.EventReminderSent,
		Version:     1,
	})
}

func (repository *Repository) MarkNotificationFailed(ctx context.Context, notification worker.DueNotification, lastError string, nextAttemptAt *time.Time) error {
	payload, err := notificationEventPayload(notification, &lastError)
	if err != nil {
		return err
	}

	return repository.recordNotificationResult(ctx, notification, worker.NotificationFailed, &lastError, nil, nextAttemptAt, worker.OutboxEventInput{
		AggregateID: notification.ID,
		BusinessID:  notification.BusinessID,
		Payload:     payload,
		RoutingKey:  "reminder.failed",
		Type:        domain.EventReminderFailed,
		Version:     1,
	})
}

func (repository *Repository) recordNotificationResult(
	ctx context.Context,
	notification worker.DueNotification,
	status worker.NotificationStatus,
	lastError *string,
	sentAt *time.Time,
	nextAttemptAt *time.Time,
	outbox worker.OutboxEventInput,
) error {
	tx, err := repository.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin notification result transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	if _, err := tx.Exec(ctx, `
		UPDATE notifications
		SET
			status = $2,
			last_error = $3,
			sent_at = $4,
			next_attempt_at = $5,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, notification.ID, string(status), lastError, sentAt, nextAttemptAt); err != nil {
		return fmt.Errorf("update notification result: %w", err)
	}

	txRepo := txRepository{tx: tx}
	if err := txRepo.CreateNotificationLog(ctx, worker.NotificationLog{
		AppointmentID:  notification.AppointmentID,
		Attempts:       notification.Attempts,
		BusinessID:     notification.BusinessID,
		Email:          notification.Email,
		LastError:      lastError,
		NotificationID: &notification.ID,
		Status:         status,
		Template:       notification.Template,
	}); err != nil {
		return err
	}
	if err := txRepo.CreateOutboxEvent(ctx, outbox); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit notification result transaction: %w", err)
	}

	return nil
}

func (repository *txRepository) CreateNotificationLog(ctx context.Context, input worker.NotificationLog) error {
	_, err := repository.tx.Exec(
		ctx,
		notificationLogSQL(),
		input.BusinessID,
		input.NotificationID,
		input.AppointmentID,
		input.WaitlistEntryID,
		input.Email,
		input.Template,
		string(input.Status),
		notificationLogAttempts(input.Attempts),
		input.LastError,
	)
	if err != nil {
		return fmt.Errorf("create notification log: %w", err)
	}

	return nil
}

func (repository *txRepository) CreateOutboxEvent(ctx context.Context, input worker.OutboxEventInput) error {
	_, err := repository.tx.Exec(ctx, `
		INSERT INTO outbox_events (
			type,
			version,
			business_id,
			aggregate_id,
			routing_key,
			payload
		)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb)
	`, input.Type, input.Version, input.BusinessID, input.AggregateID, input.RoutingKey, string(input.Payload))
	if err != nil {
		return fmt.Errorf("insert outbox event: %w", err)
	}

	return nil
}

func (repository *txRepository) CreateScheduledNotification(ctx context.Context, input worker.ScheduledNotificationInput) (string, error) {
	var notificationID string
	err := repository.tx.QueryRow(ctx, `
		INSERT INTO notifications (
			business_id,
			appointment_id,
			customer_id,
			channel,
			email,
			template,
			status,
			due_at,
			next_attempt_at,
			payload
		)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $7, $8::jsonb)
		ON CONFLICT (appointment_id, template) WHERE appointment_id IS NOT NULL
		DO UPDATE SET updated_at = CURRENT_TIMESTAMP
		RETURNING id
	`, input.BusinessID, input.AppointmentID, input.CustomerID, input.Channel, input.Email, input.Template, input.DueAt, string(input.Payload)).Scan(&notificationID)
	if err != nil {
		return "", fmt.Errorf("insert scheduled notification: %w", err)
	}

	return notificationID, nil
}

func (repository *txRepository) CreateWaitlistOffer(ctx context.Context, input worker.WaitlistOfferInput) (string, error) {
	var offerID string
	err := repository.tx.QueryRow(ctx, `
		INSERT INTO waitlist_offers (waitlist_entry_id, appointment_id, token, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, input.WaitlistEntryID, input.AppointmentID, input.Token, input.ExpiresAt).Scan(&offerID)
	if err != nil {
		return "", fmt.Errorf("insert waitlist offer: %w", err)
	}

	return offerID, nil
}

func (repository *txRepository) GetReminderSettings(ctx context.Context, businessID string) (worker.ReminderSettings, error) {
	settings := worker.ReminderSettings{
		Channel:       "mock",
		Enabled:       true,
		OffsetMinutes: 1440,
		Template:      "appointment_reminder_24h",
	}
	err := repository.tx.QueryRow(ctx, `
		SELECT enabled, offset_minutes, channel, template
		FROM business_reminder_settings
		WHERE business_id = $1
	`, businessID).Scan(&settings.Enabled, &settings.OffsetMinutes, &settings.Channel, &settings.Template)
	if errors.Is(err, pgx.ErrNoRows) {
		return settings, nil
	}
	if err != nil {
		return settings, fmt.Errorf("query reminder settings: %w", err)
	}

	return settings, nil
}

func (repository *txRepository) FindWaitlistCandidate(ctx context.Context, appointment domain.AppointmentPayload) (*domain.WaitlistCandidate, error) {
	var candidate domain.WaitlistCandidate
	err := repository.tx.QueryRow(ctx, `
		SELECT
			we.id,
			c.email,
			c.name,
			c.no_show_count
		FROM waitlist_entries we
		JOIN customers c ON c.id = we.customer_id
		WHERE we.business_id = $1
			AND we.service_id = $2
			AND we.status = 'waiting'
			AND we.preferred_date_start <= $3::date
			AND we.preferred_date_end >= $3::date
			AND (we.earliest_time IS NULL OR we.earliest_time <= $4)
			AND (we.latest_time IS NULL OR we.latest_time >= $4)
			AND NOT EXISTS (
				SELECT 1
				FROM waitlist_offers pending_offer
				WHERE pending_offer.waitlist_entry_id = we.id
					AND pending_offer.status = 'pending'
			)
			AND NOT EXISTS (
				SELECT 1
				FROM waitlist_offers prior_offer
				WHERE prior_offer.waitlist_entry_id = we.id
					AND prior_offer.appointment_id = $5
			)
		ORDER BY we.priority_score DESC, c.no_show_count ASC, we.created_at ASC
		LIMIT 1
		FOR UPDATE OF we SKIP LOCKED
	`, appointment.BusinessID, appointment.Service.ID, appointment.StartsAt.Format("2006-01-02"), appointment.StartsAt.Format("15:04"), appointment.AppointmentID).Scan(
		&candidate.EntryID,
		&candidate.CustomerEmail,
		&candidate.CustomerName,
		&candidate.NoShowCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query waitlist candidate: %w", err)
	}

	return &candidate, nil
}

func (repository *txRepository) MarkWaitlistEntryOffered(ctx context.Context, entryID string) error {
	_, err := repository.tx.Exec(ctx, `
		UPDATE waitlist_entries
		SET status = 'offered', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, entryID)
	if err != nil {
		return fmt.Errorf("mark waitlist entry offered: %w", err)
	}

	return nil
}

func notificationLogSQL() string {
	return `
		INSERT INTO notification_logs (
			business_id,
			notification_id,
			appointment_id,
			waitlist_entry_id,
			email,
			template,
			status,
			attempts,
			last_error,
			sent_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7::notification_status, $8, $9, CASE WHEN $7::notification_status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)
	`
}

func notificationLogAttempts(value int) int {
	if value > 0 {
		return value
	}

	return 1
}

func notificationEventPayload(notification worker.DueNotification, lastError *string) ([]byte, error) {
	payload := map[string]any{
		"appointmentId":  notification.AppointmentID,
		"attempts":       notification.Attempts,
		"businessId":     notification.BusinessID,
		"channel":        notification.Channel,
		"customerEmail":  notification.Email,
		"dueAt":          notification.DueAt.Format(time.RFC3339),
		"notificationId": notification.ID,
		"template":       notification.Template,
	}
	if lastError != nil {
		payload["lastError"] = *lastError
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode notification event payload: %w", err)
	}

	return body, nil
}
