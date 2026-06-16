package email

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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
