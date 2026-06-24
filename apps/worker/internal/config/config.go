package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

const (
	WorkerModeAll       = "all"
	WorkerModeConsumer  = "consumer"
	WorkerModeScheduler = "scheduler"
)

type Config struct {
	AppBaseURL               string
	AttendanceBatchSize      int
	DatabaseURL              string
	EmailFrom                string
	EmailTransport           string
	MaxNotificationAttempts  int
	RabbitMQPrefetch         int
	RabbitMQURL              string
	ReminderBatchSize        int
	SchedulerIntervalSeconds int
	SMTPHost                 string
	SMTPPassword             string
	SMTPPort                 int
	SMTPTimeoutSeconds       int
	SMTPUser                 string
	WorkerConcurrency        int
	WorkerMode               string
}

func Load() Config {
	workerConcurrency := getEnvPositiveInt("WORKER_CONCURRENCY", 4)

	return Config{
		AppBaseURL:               getEnv("APP_BASE_URL", "http://localhost:3000"),
		AttendanceBatchSize:      getEnvPositiveInt("ATTENDANCE_BATCH_SIZE", 25),
		DatabaseURL:              getEnv("DATABASE_URL", "postgres://turnoflow:turnoflow@localhost:5432/turnoflow?sslmode=disable"),
		EmailFrom:                getEnv("EMAIL_FROM", "TurnoFlow <noreply@turnoflow.local>"),
		EmailTransport:           getEnv("EMAIL_TRANSPORT", "json"),
		MaxNotificationAttempts:  getEnvPositiveInt("MAX_NOTIFICATION_ATTEMPTS", 3),
		RabbitMQPrefetch:         getEnvPositiveInt("RABBITMQ_PREFETCH", workerConcurrency*2),
		RabbitMQURL:              getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		ReminderBatchSize:        getEnvPositiveInt("REMINDER_BATCH_SIZE", 25),
		SchedulerIntervalSeconds: getEnvPositiveInt("SCHEDULER_INTERVAL_SECONDS", 60),
		SMTPHost:                 getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPassword:             getEnv("SMTP_PASSWORD", ""),
		SMTPPort:                 getEnvPositiveInt("SMTP_PORT", 587),
		SMTPTimeoutSeconds:       getEnvPositiveInt("SMTP_TIMEOUT_SECONDS", 10),
		SMTPUser:                 getEnv("SMTP_USER", ""),
		WorkerConcurrency:        workerConcurrency,
		WorkerMode:               getEnv("WORKER_MODE", WorkerModeAll),
	}
}

func (config Config) SMTPTimeout() time.Duration {
	return time.Duration(config.SMTPTimeoutSeconds) * time.Second
}

func (config Config) SchedulerInterval() time.Duration {
	return time.Duration(config.SchedulerIntervalSeconds) * time.Second
}

func (config Config) ShouldRunConsumer() bool {
	return config.WorkerMode == WorkerModeAll || config.WorkerMode == WorkerModeConsumer
}

func (config Config) ShouldRunScheduler() bool {
	return config.WorkerMode == WorkerModeAll || config.WorkerMode == WorkerModeScheduler
}

func (config Config) Validate() error {
	switch config.WorkerMode {
	case WorkerModeAll, WorkerModeConsumer, WorkerModeScheduler:
	default:
		return fmt.Errorf("unsupported worker mode %q", config.WorkerMode)
	}

	if config.WorkerConcurrency <= 0 {
		return fmt.Errorf("worker concurrency must be positive")
	}
	if config.RabbitMQPrefetch <= 0 {
		return fmt.Errorf("rabbitmq prefetch must be positive")
	}
	if config.ReminderBatchSize <= 0 {
		return fmt.Errorf("reminder batch size must be positive")
	}
	if config.AttendanceBatchSize <= 0 {
		return fmt.Errorf("attendance batch size must be positive")
	}
	if config.MaxNotificationAttempts <= 0 {
		return fmt.Errorf("max notification attempts must be positive")
	}
	if config.SchedulerIntervalSeconds <= 0 {
		return fmt.Errorf("scheduler interval must be positive")
	}

	return nil
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsedValue, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsedValue
}

func getEnvPositiveInt(key string, fallback int) int {
	value := getEnvInt(key, fallback)
	if value <= 0 {
		return fallback
	}

	return value
}
