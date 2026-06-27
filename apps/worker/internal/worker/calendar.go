package worker

import (
	"context"
	"time"
)

type CalendarClient interface {
	CreateEvent(ctx context.Context, accessToken string, event CalendarEvent) (string, error)
	DeleteEvent(ctx context.Context, accessToken string, eventID string) error
	ListEventsByAppointment(ctx context.Context, accessToken string, appointmentID string) ([]string, error)
	RefreshAccessToken(ctx context.Context, refreshToken string) (CalendarToken, error)
	UpdateEvent(ctx context.Context, accessToken string, eventID string, event CalendarEvent) error
}

type TokenCodec interface {
	Decrypt(value string) (string, error)
	Encrypt(value string) (string, error)
}

type CalendarEvent struct {
	Description   string
	EndsAt        time.Time
	AppointmentID string
	StartsAt      time.Time
	Summary       string
	Timezone      string
}

type CalendarToken struct {
	AccessToken string
	ExpiresAt   time.Time
}

type CalendarError struct {
	Code       string
	Message    string
	StatusCode int
}

func (err CalendarError) Error() string {
	if err.Message != "" {
		return err.Message
	}

	return err.Code
}

func (err CalendarError) IsExpiredGrant() bool {
	return err.Code == "invalid_grant"
}

func (err CalendarError) IsPermanentAuthFailure() bool {
	return err.StatusCode == 401 || err.StatusCode == 403
}

type noopCalendarClient struct{}

func (noopCalendarClient) CreateEvent(context.Context, string, CalendarEvent) (string, error) {
	return "", nil
}

func (noopCalendarClient) DeleteEvent(context.Context, string, string) error {
	return nil
}

func (noopCalendarClient) ListEventsByAppointment(context.Context, string, string) ([]string, error) {
	return nil, nil
}

func (noopCalendarClient) RefreshAccessToken(context.Context, string) (CalendarToken, error) {
	return CalendarToken{}, nil
}

func (noopCalendarClient) UpdateEvent(context.Context, string, string, CalendarEvent) error {
	return nil
}

func isNoopCalendarClient(client CalendarClient) bool {
	_, ok := client.(noopCalendarClient)
	return ok
}
