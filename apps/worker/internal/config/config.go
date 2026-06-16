package config

import "os"

type Config struct {
	AppBaseURL     string
	DatabaseURL    string
	EmailFrom      string
	EmailTransport string
	RabbitMQURL    string
}

func Load() Config {
	return Config{
		AppBaseURL:     getEnv("APP_BASE_URL", "http://localhost:3000"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://turnoflow:turnoflow@localhost:5432/turnoflow?sslmode=disable"),
		EmailFrom:      getEnv("EMAIL_FROM", "TurnoFlow <noreply@turnoflow.local>"),
		EmailTransport: getEnv("EMAIL_TRANSPORT", "json"),
		RabbitMQURL:    getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
	}
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
