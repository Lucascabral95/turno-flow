package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/signal"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/turnoflow/turnoflow/apps/worker/internal/config"
	"github.com/turnoflow/turnoflow/apps/worker/internal/domain"
	"github.com/turnoflow/turnoflow/apps/worker/internal/email"
	"github.com/turnoflow/turnoflow/apps/worker/internal/postgres"
	worker "github.com/turnoflow/turnoflow/apps/worker/internal/worker"
)

const (
	eventsExchange       = "turnoflow.events"
	startupRetryAttempts = 30
	startupRetryDelay    = 2 * time.Second
	workerQueue          = "worker.appointments"
)

var eventBindingKeys = []string{"appointment.booked", "appointment.cancelled", "appointment.marked_no_show"}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.Load()
	repository, err := connectPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer repository.Close()

	sender := email.NewJSONSender(cfg.EmailFrom)
	service := worker.NewService(repository, sender, cfg.AppBaseURL, cfg.EmailFrom)

	connection, err := connectRabbitMQ(ctx, cfg.RabbitMQURL)
	if err != nil {
		log.Fatalf("rabbitmq dial: %v", err)
	}
	defer connection.Close()

	channel, err := connection.Channel()
	if err != nil {
		log.Fatalf("rabbitmq channel: %v", err)
	}
	defer channel.Close()

	deliveries, err := consumeEvents(channel)
	if err != nil {
		log.Fatalf("rabbitmq consume: %v", err)
	}

	go runPeriodicJobs(ctx, service)

	for {
		select {
		case <-ctx.Done():
			log.Print("worker shutting down")
			return
		case delivery, ok := <-deliveries:
			if !ok {
				log.Print("rabbitmq delivery channel closed")
				return
			}
			handleDelivery(ctx, service, delivery)
		}
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
			log.Printf("%s not ready attempt=%d/%d error=%v", label, attempt, startupRetryAttempts, err)
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

func consumeEvents(channel *amqp.Channel) (<-chan amqp.Delivery, error) {
	if err := channel.ExchangeDeclare(eventsExchange, "topic", true, false, false, false, nil); err != nil {
		return nil, err
	}

	queue, err := channel.QueueDeclare(workerQueue, true, false, false, false, nil)
	if err != nil {
		return nil, err
	}

	for _, bindingKey := range eventBindingKeys {
		if err := channel.QueueBind(queue.Name, bindingKey, eventsExchange, false, nil); err != nil {
			return nil, err
		}
	}

	if err := channel.Qos(10, 0, false); err != nil {
		return nil, err
	}

	return channel.Consume(queue.Name, "", false, false, false, false, nil)
}

func handleDelivery(ctx context.Context, service *worker.Service, delivery amqp.Delivery) {
	var event domain.Event
	if err := json.Unmarshal(delivery.Body, &event); err != nil {
		log.Printf("drop invalid event payload: %v", err)
		_ = delivery.Nack(false, false)
		return
	}

	if err := service.HandleEvent(ctx, event); err != nil {
		log.Printf("event processing failed event_id=%s type=%s error=%v", event.EventID, event.Type, err)
		_ = delivery.Nack(false, true)
		return
	}

	_ = delivery.Ack(false)
}

func runPeriodicJobs(ctx context.Context, service *worker.Service) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			if err := service.SendDueReminders(ctx, now.UTC()); err != nil {
				log.Printf("send due reminders: %v", err)
			}
			if err := service.ExpireWaitlistOffers(ctx, now.UTC()); err != nil {
				log.Printf("expire waitlist offers: %v", err)
			}
		}
	}
}
