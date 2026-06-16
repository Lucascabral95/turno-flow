package postgres

import (
	"context"
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
	_, err := repository.pool.Exec(ctx, notificationLogSQL(), input.BusinessID, input.AppointmentID, input.WaitlistEntryID, input.Email, input.Template, string(input.Status), input.LastError)
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
			RETURNING waitlist_entry_id
		)
		UPDATE waitlist_entries
		SET status = 'waiting', updated_at = CURRENT_TIMESTAMP
		WHERE status = 'offered' AND id IN (SELECT waitlist_entry_id FROM expired)
	`, now)
	if err != nil {
		return fmt.Errorf("expire waitlist offers: %w", err)
	}

	return nil
}

func (repository *Repository) FindDueReminderAppointments(ctx context.Context, from time.Time, until time.Time) ([]domain.ReminderAppointment, error) {
	rows, err := repository.pool.Query(ctx, `
		SELECT
			a.id,
			a.business_id,
			a.cancellation_token,
			c.email,
			c.name,
			s.name,
			a.starts_at
		FROM appointments a
		JOIN customers c ON c.id = a.customer_id
		JOIN services s ON s.id = a.service_id
		WHERE a.status = 'confirmed'
			AND a.starts_at >= $1
			AND a.starts_at < $2
			AND NOT EXISTS (
				SELECT 1
				FROM notification_logs n
				WHERE n.appointment_id = a.id
					AND n.template = 'appointment_reminder_24h'
					AND n.status = 'sent'
			)
		ORDER BY a.starts_at ASC
	`, from, until)
	if err != nil {
		return nil, fmt.Errorf("query due reminder appointments: %w", err)
	}
	defer rows.Close()

	appointments := make([]domain.ReminderAppointment, 0)
	for rows.Next() {
		var appointment domain.ReminderAppointment
		if err := rows.Scan(
			&appointment.AppointmentID,
			&appointment.BusinessID,
			&appointment.CancellationToken,
			&appointment.CustomerEmail,
			&appointment.CustomerName,
			&appointment.ServiceName,
			&appointment.StartsAt,
		); err != nil {
			return nil, fmt.Errorf("scan due reminder appointment: %w", err)
		}
		appointments = append(appointments, appointment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate due reminder appointments: %w", err)
	}

	return appointments, nil
}

func (repository *txRepository) CreateNotificationLog(ctx context.Context, input worker.NotificationLog) error {
	_, err := repository.tx.Exec(ctx, notificationLogSQL(), input.BusinessID, input.AppointmentID, input.WaitlistEntryID, input.Email, input.Template, string(input.Status), input.LastError)
	if err != nil {
		return fmt.Errorf("create notification log: %w", err)
	}

	return nil
}

func (repository *txRepository) CreateWaitlistOffer(ctx context.Context, input worker.WaitlistOfferInput) error {
	_, err := repository.tx.Exec(ctx, `
		INSERT INTO waitlist_offers (waitlist_entry_id, appointment_id, token, expires_at)
		VALUES ($1, $2, $3, $4)
	`, input.WaitlistEntryID, input.AppointmentID, input.Token, input.ExpiresAt)
	if err != nil {
		return fmt.Errorf("insert waitlist offer: %w", err)
	}

	return nil
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
		ORDER BY we.priority_score DESC, c.no_show_count ASC, we.created_at ASC
		LIMIT 1
	`, appointment.BusinessID, appointment.Service.ID, appointment.StartsAt.Format("2006-01-02"), appointment.StartsAt.Format("15:04")).Scan(
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
			appointment_id,
			waitlist_entry_id,
			email,
			template,
			status,
			attempts,
			last_error,
			sent_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, 1, $7, CASE WHEN $6 = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)
	`
}
