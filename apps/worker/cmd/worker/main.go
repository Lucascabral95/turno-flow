package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/turnoflow/turnoflow/apps/worker/internal/config"
	"github.com/turnoflow/turnoflow/apps/worker/internal/email"
	"github.com/turnoflow/turnoflow/apps/worker/internal/postgres"
	worker "github.com/turnoflow/turnoflow/apps/worker/internal/worker"
)

const (
	eventsExchange       = "turnoflow.events"
	startupRetryAttempts = 30
	startupRetryDelay    = 2 * time.Second
	workerQueue          = "worker.appointments"
	workerQueueDLQ       = "worker.appointments.dlq"
)

var eventBindingKeys = []string{
	"appointment.booked",
	"appointment.confirmed",
	"appointment.cancelled",
	"appointment.completed",
	"appointment.no_show",
	"appointment.marked_no_show",
	"appointment.rescheduled",
	"appointment.reminder_due",
	"notification.reminder_due",
	"slot.reassigned",
	"slot.released",
	"waitlist.offer_expired",
	"waitlist.offer_rejected",
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{}))
	slog.SetDefault(logger)
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		logger.Error("invalid worker config", "error", err)
		os.Exit(1)
	}

	repository, err := connectPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer repository.Close()

	sender, err := createEmailSender(cfg)
	if err != nil {
		logger.Error("email sender setup failed", "error", err)
		os.Exit(1)
	}

	service := worker.NewServiceWithOptions(repository, sender, cfg.AppBaseURL, cfg.EmailFrom, worker.Options{
		AttendanceReviewBatchSize: cfg.AttendanceBatchSize,
		DueNotificationBatchSize:  cfg.ReminderBatchSize,
		MaxNotificationAttempts:   cfg.MaxNotificationAttempts,
	})
	if cfg.HasGoogleCalendarSync() {
		calendarClient, tokenCodec, err := createCalendarSync(cfg)
		if err != nil {
			logger.Error("google calendar setup failed", "error", err)
			os.Exit(1)
		}
		service.WithCalendarSync(calendarClient, tokenCodec)
		logger.Info("google calendar sync enabled")
	} else {
		logger.Info("google calendar sync disabled")
	}

	if err := run(ctx, cfg, service, logger); err != nil {
		logger.Error("worker stopped with error", "error", err)
		os.Exit(1)
	}
}

func createCalendarSync(cfg config.Config) (worker.CalendarClient, worker.TokenCodec, error) {
	calendarClient, err := worker.NewGoogleCalendarClient(worker.GoogleCalendarClientConfig{
		ClientID:     cfg.GoogleCalendarClientID,
		ClientSecret: cfg.GoogleCalendarClientSecret,
		Timeout:      cfg.GoogleCalendarTimeout(),
	})
	if err != nil {
		return nil, nil, err
	}

	tokenCodec, err := worker.NewAESGCMTokenCodec(cfg.CalendarTokenEncryptionKey)
	if err != nil {
		return nil, nil, err
	}

	return calendarClient, tokenCodec, nil
}

func createEmailSender(cfg config.Config) (email.Sender, error) {
	switch cfg.EmailTransport {
	case "json":
		return email.NewJSONSender(cfg.EmailFrom), nil
	case "smtp":
		return email.NewSMTPSender(email.SMTPConfig{
			From:     cfg.EmailFrom,
			Host:     cfg.SMTPHost,
			Password: cfg.SMTPPassword,
			Port:     cfg.SMTPPort,
			Timeout:  cfg.SMTPTimeout(),
			User:     cfg.SMTPUser,
		})
	default:
		return nil, fmt.Errorf("unsupported email transport %q", cfg.EmailTransport)
	}
}

func connectPostgres(ctx context.Context, databaseURL string) (*postgres.Repository, error) {
	var repository *postgres.Repository
	err := retryStartup(ctx, "postgres", func() error {
		var err error
		repository, err = postgres.NewRepository(ctx, databaseURL)
		return err
	})
	if err != nil {
		return nil, err
	}

	return repository, nil
}

func connectRabbitMQ(ctx context.Context, rabbitMQURL string) (*amqp.Connection, error) {
	var connection *amqp.Connection
	err := retryStartup(ctx, "rabbitmq", func() error {
		var err error
		connection, err = amqp.Dial(rabbitMQURL)
		return err
	})
	if err != nil {
		return nil, err
	}

	return connection, nil
}

func retryStartup(ctx context.Context, label string, fn func() error) error {
	var lastErr error
	for attempt := 1; attempt <= startupRetryAttempts; attempt++ {
		if err := fn(); err != nil {
			lastErr = err
			slog.Warn("dependency not ready", "dependency", label, "attempt", attempt, "max_attempts", startupRetryAttempts, "error", err)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(startupRetryDelay):
				continue
			}
		}

		return nil
	}

	return fmt.Errorf("%s not ready after %d attempts: %w", label, startupRetryAttempts, lastErr)
}
