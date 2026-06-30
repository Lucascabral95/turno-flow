package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/getsentry/sentry-go"

	"github.com/turnoflow/turnoflow/apps/worker/internal/config"
	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
	worker "github.com/turnoflow/turnoflow/apps/worker/internal/worker"
)

const (
	deadLetterExchange = "turnoflow.events.dlx"
	deadLetterKey      = "worker.appointments.dead"
)

type deliveryHandler func(context.Context, *worker.Service, amqp.Delivery)

func run(ctx context.Context, cfg config.Config, service *worker.Service, logger *slog.Logger) error {
	runners := make([]func(context.Context) error, 0, 2)

	if cfg.ShouldRunConsumer() {
		runners = append(runners, func(ctx context.Context) error {
			return runConsumer(ctx, cfg, service, logger)
		})
	}
	if cfg.ShouldRunScheduler() {
		runners = append(runners, func(ctx context.Context) error {
			runScheduler(ctx, cfg, service, logger)
			return nil
		})
	}
	if len(runners) == 0 {
		return errors.New("no worker runners enabled")
	}

	logger.Info(
		"worker starting",
		"worker_mode", cfg.WorkerMode,
		"worker_concurrency", cfg.WorkerConcurrency,
		"rabbitmq_prefetch", cfg.RabbitMQPrefetch,
	)

	errCh := make(chan error, len(runners))
	for _, runner := range runners {
		go func(runner func(context.Context) error) {
			errCh <- runner(ctx)
		}(runner)
	}

	for range runners {
		select {
		case <-ctx.Done():
			logger.Info("worker shutting down", "worker_mode", cfg.WorkerMode)
			return nil
		case err := <-errCh:
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func runConsumer(ctx context.Context, cfg config.Config, service *worker.Service, logger *slog.Logger) error {
	connection, err := connectRabbitMQ(ctx, cfg.RabbitMQURL)
	if err != nil {
		return fmt.Errorf("rabbitmq dial: %w", err)
	}
	defer connection.Close()

	channel, err := connection.Channel()
	if err != nil {
		return fmt.Errorf("rabbitmq channel: %w", err)
	}
	defer channel.Close()

	deliveries, err := consumeEvents(channel, cfg.RabbitMQPrefetch)
	if err != nil {
		return fmt.Errorf("rabbitmq consume: %w", err)
	}

	logger.Info("event consumer started", "queue", workerQueue, "concurrency", cfg.WorkerConcurrency)

	var wg sync.WaitGroup
	runDeliveryWorkers(ctx, &wg, logger, cfg.WorkerConcurrency, deliveries, service, handleDelivery)
	workersDone := make(chan struct{})
	go func() {
		wg.Wait()
		close(workersDone)
	}()

	select {
	case <-ctx.Done():
		_ = channel.Cancel(workerQueue, false)
		<-workersDone
		return nil
	case <-workersDone:
		return errors.New("rabbitmq deliveries closed")
	}
}

func runDeliveryWorkers(
	ctx context.Context,
	wg *sync.WaitGroup,
	logger *slog.Logger,
	concurrency int,
	deliveries <-chan amqp.Delivery,
	service *worker.Service,
	handler deliveryHandler,
) {
	for workerIndex := 1; workerIndex <= concurrency; workerIndex++ {
		workerID := fmt.Sprintf("consumer-%d", workerIndex)
		wg.Add(1)
		go func(workerID string) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case delivery, ok := <-deliveries:
					if !ok {
						logger.Warn("rabbitmq delivery channel closed", "worker_id", workerID, "queue", workerQueue)
						return
					}
					handler(ctx, service, delivery)
				}
			}
		}(workerID)
	}
}

func consumeEvents(channel *amqp.Channel, prefetch int) (<-chan amqp.Delivery, error) {
	if err := channel.ExchangeDeclare(eventsExchange, "topic", true, false, false, false, nil); err != nil {
		return nil, err
	}
	if err := channel.ExchangeDeclare(deadLetterExchange, "direct", true, false, false, false, nil); err != nil {
		return nil, err
	}
	if _, err := channel.QueueDeclare(workerQueueDLQ, true, false, false, false, nil); err != nil {
		return nil, err
	}
	if err := channel.QueueBind(workerQueueDLQ, deadLetterKey, deadLetterExchange, false, nil); err != nil {
		return nil, err
	}

	queue, err := channel.QueueDeclare(workerQueue, true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    deadLetterExchange,
		"x-dead-letter-routing-key": deadLetterKey,
	})
	if err != nil {
		return nil, err
	}

	for _, bindingKey := range eventBindingKeys {
		if err := channel.QueueBind(queue.Name, bindingKey, eventsExchange, false, nil); err != nil {
			return nil, err
		}
	}

	if err := channel.Qos(prefetch, 0, false); err != nil {
		return nil, err
	}

	return channel.Consume(queue.Name, workerQueue, false, false, false, false, nil)
}

func handleDelivery(ctx context.Context, service *worker.Service, delivery amqp.Delivery) {
	startedAt := time.Now()
	event, err := decodeEvent(delivery.Body)
	if err != nil {
		slog.Warn("event sent to dlq", "queue", workerQueue, "error", err)
		_ = delivery.Nack(false, false)
		return
	}

	logger := slog.With(
		"event_id", event.EventID,
		"event_type", event.Type,
		"business_id", event.BusinessID,
		"correlation_id", event.CorrelationID,
		"queue", workerQueue,
	)
	if err := service.HandleEvent(ctx, event); err != nil {
		logger.Error("event processing failed", "error", err, "duration_ms", time.Since(startedAt).Milliseconds())
		sentry.CaptureException(err)
		_ = delivery.Nack(false, true)
		return
	}

	logger.Info("event processed", "duration_ms", time.Since(startedAt).Milliseconds())
	_ = delivery.Ack(false)
}

func decodeEvent(body []byte) (domain.Event, error) {
	var event domain.Event
	if err := json.Unmarshal(body, &event); err != nil {
		return event, fmt.Errorf("decode event payload: %w", err)
	}
	if event.EventID == "" {
		return event, errors.New("eventId is required")
	}
	if event.Type == "" {
		return event, errors.New("type is required")
	}

	return event, nil
}

func runScheduler(ctx context.Context, cfg config.Config, service *worker.Service, logger *slog.Logger) {
	logger.Info("scheduler started", "interval_seconds", cfg.SchedulerIntervalSeconds)
	runScheduledJobs(ctx, service, logger, time.Now().UTC())

	ticker := time.NewTicker(cfg.SchedulerInterval())
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("scheduler stopped")
			return
		case now := <-ticker.C:
			runScheduledJobs(ctx, service, logger, now.UTC())
		}
	}
}

func runScheduledJobs(ctx context.Context, service *worker.Service, logger *slog.Logger, now time.Time) {
	runScheduledJob(ctx, logger, "send_due_reminders", func(ctx context.Context) error {
		return service.SendDueReminders(ctx, now)
	})
	runScheduledJob(ctx, logger, "process_attendance_alerts", func(ctx context.Context) error {
		return service.ProcessAttendanceAlerts(ctx, now)
	})
	runScheduledJob(ctx, logger, "expire_waitlist_offers", func(ctx context.Context) error {
		return service.ExpireWaitlistOffers(ctx, now)
	})
	runScheduledJob(ctx, logger, "create_recurring_appointments", func(ctx context.Context) error {
		return service.CreateRecurringAppointments(ctx, now)
	})
}

func runScheduledJob(ctx context.Context, logger *slog.Logger, name string, fn func(context.Context) error) {
	startedAt := time.Now()
	if err := fn(ctx); err != nil {
		logger.Error("scheduled job failed", "job", name, "duration_ms", time.Since(startedAt).Milliseconds(), "error", err)
		return
	}

	logger.Info("scheduled job completed", "job", name, "duration_ms", time.Since(startedAt).Milliseconds())
}
