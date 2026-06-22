package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	AppBaseURL         string
	DatabaseURL        string
	EmailFrom          string
	EmailTransport     string
	RabbitMQURL        string
	SMTPHost           string
	SMTPPassword       string
	SMTPPort           int
	SMTPTimeoutSeconds int
	SMTPUser           string
}

func Load() Config {
	return Config{
		AppBaseURL:         getEnv("APP_BASE_URL", "http://localhost:3000"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://turnoflow:turnoflow@localhost:5432/turnoflow?sslmode=disable"),
		EmailFrom:          getEnv("EMAIL_FROM", "TurnoFlow <noreply@turnoflow.local>"),
		EmailTransport:     getEnv("EMAIL_TRANSPORT", "json"),
		RabbitMQURL:        getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		SMTPHost:           getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPassword:       getEnv("SMTP_PASSWORD", ""),
		SMTPPort:           getEnvInt("SMTP_PORT", 587),
		SMTPTimeoutSeconds: getEnvInt("SMTP_TIMEOUT_SECONDS", 10),
		SMTPUser:           getEnv("SMTP_USER", ""),
	}
}

func (config Config) SMTPTimeout() time.Duration {
	return time.Duration(config.SMTPTimeoutSeconds) * time.Second
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
