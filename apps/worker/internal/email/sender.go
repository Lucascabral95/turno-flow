package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type Message struct {
	From    string
	To      string
	Subject string
	Text    string
}

type Sender interface {
	Send(ctx context.Context, message Message) error
}

type JSONSender struct {
	from string
}

func NewJSONSender(from string) *JSONSender {
	return &JSONSender{from: from}
}

func (sender *JSONSender) Send(_ context.Context, message Message) error {
	if message.From == "" {
		message.From = sender.from
	}

	payload, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal email payload: %w", err)
	}

	log.Printf("email=%s", string(payload))
	return nil
}

type SMTPConfig struct {
	From     string
	Host     string
	Password string
	Port     int
	Timeout  time.Duration
	User     string
}

type SMTPSender struct {
	config SMTPConfig
}

func NewSMTPSender(config SMTPConfig) (*SMTPSender, error) {
	if config.Host == "" {
		return nil, fmt.Errorf("smtp host is required")
	}
	if config.Port <= 0 {
		return nil, fmt.Errorf("smtp port must be positive")
	}
	if config.User == "" {
		return nil, fmt.Errorf("smtp user is required")
	}
	if config.Password == "" {
		return nil, fmt.Errorf("smtp password is required")
	}
	if config.From == "" {
		config.From = config.User
	}
	if config.Timeout <= 0 {
		config.Timeout = 10 * time.Second
	}

	return &SMTPSender{config: config}, nil
}

func (sender *SMTPSender) Send(ctx context.Context, message Message) error {
	if message.From == "" {
		message.From = sender.config.From
	}

	fromAddress, err := parseEmailAddress(message.From)
	if err != nil {
		return fmt.Errorf("parse sender address: %w", err)
	}
	toAddress, err := parseEmailAddress(message.To)
	if err != nil {
		return fmt.Errorf("parse recipient address: %w", err)
	}

	address := net.JoinHostPort(sender.config.Host, fmt.Sprintf("%d", sender.config.Port))
	dialer := net.Dialer{Timeout: sender.config.Timeout}
	connection, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("connect smtp: %w", err)
	}
	defer connection.Close()

	client, err := smtp.NewClient(connection, sender.config.Host)
	if err != nil {
		return fmt.Errorf("create smtp client: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); !ok {
		return fmt.Errorf("smtp server does not support STARTTLS")
	}
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: sender.config.Host}
	if err := client.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("start smtp tls: %w", err)
	}

	auth := smtp.PlainAuth("", sender.config.User, sender.config.Password, sender.config.Host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("authenticate smtp: %w", err)
	}
	if err := client.Mail(fromAddress); err != nil {
		return fmt.Errorf("set smtp sender: %w", err)
	}
	if err := client.Rcpt(toAddress); err != nil {
		return fmt.Errorf("set smtp recipient: %w", err)
	}

	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("open smtp data writer: %w", err)
	}
	if _, err := writer.Write(buildSMTPMessage(message)); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write smtp message: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close smtp data writer: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("quit smtp: %w", err)
	}

	return nil
}

func buildSMTPMessage(message Message) []byte {
	var buffer bytes.Buffer
	headers := map[string]string{
		"From":         message.From,
		"To":           message.To,
		"Subject":      message.Subject,
		"MIME-Version": "1.0",
		"Content-Type": "text/plain; charset=UTF-8",
	}
	headerOrder := []string{"From", "To", "Subject", "MIME-Version", "Content-Type"}

	for _, key := range headerOrder {
		buffer.WriteString(key)
		buffer.WriteString(": ")
		buffer.WriteString(sanitizeHeader(headers[key]))
		buffer.WriteString("\r\n")
	}
	buffer.WriteString("\r\n")
	buffer.WriteString(normalizeBody(message.Text))
	return buffer.Bytes()
}

func parseEmailAddress(value string) (string, error) {
	address, err := mail.ParseAddress(value)
	if err != nil {
		return "", err
	}

	return address.Address, nil
}

func sanitizeHeader(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\r", ""), "\n", "")
}

func normalizeBody(value string) string {
	return strings.ReplaceAll(value, "\n", "\r\n")
}
