package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
	_ "time/tzdata"
)

const (
	googleCalendarEventsURL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
	googleTokenURL          = "https://oauth2.googleapis.com/token"
)

type GoogleCalendarClient struct {
	client       *http.Client
	clientID     string
	clientSecret string
}

type GoogleCalendarClientConfig struct {
	ClientID     string
	ClientSecret string
	Timeout      time.Duration
}

func NewGoogleCalendarClient(config GoogleCalendarClientConfig) (*GoogleCalendarClient, error) {
	if config.ClientID == "" || config.ClientSecret == "" {
		return nil, fmt.Errorf("google calendar client id and secret are required")
	}
	if config.Timeout <= 0 {
		config.Timeout = 10 * time.Second
	}

	return &GoogleCalendarClient{
		client:       &http.Client{Timeout: config.Timeout},
		clientID:     config.ClientID,
		clientSecret: config.ClientSecret,
	}, nil
}

func (client *GoogleCalendarClient) CreateEvent(ctx context.Context, accessToken string, event CalendarEvent) (string, error) {
	body, err := json.Marshal(googleEventBody(event))
	if err != nil {
		return "", fmt.Errorf("encode google calendar event: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, googleCalendarEventsURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	authorizeGoogleRequest(request, accessToken)

	response, err := client.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", googleCalendarError(response)
	}

	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode google calendar insert response: %w", err)
	}
	if result.ID == "" {
		return "", fmt.Errorf("google calendar insert response did not include id")
	}

	return result.ID, nil
}

func (client *GoogleCalendarClient) UpdateEvent(ctx context.Context, accessToken string, eventID string, event CalendarEvent) error {
	body, err := json.Marshal(googleEventBody(event))
	if err != nil {
		return fmt.Errorf("encode google calendar event: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPut, googleCalendarEventsURL+"/"+url.PathEscape(eventID), bytes.NewReader(body))
	if err != nil {
		return err
	}
	authorizeGoogleRequest(request, accessToken)

	response, err := client.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return googleCalendarError(response)
	}

	return nil
}

func (client *GoogleCalendarClient) DeleteEvent(ctx context.Context, accessToken string, eventID string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, googleCalendarEventsURL+"/"+url.PathEscape(eventID), nil)
	if err != nil {
		return err
	}
	authorizeGoogleRequest(request, accessToken)

	response, err := client.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone {
		return nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return googleCalendarError(response)
	}

	return nil
}

func (client *GoogleCalendarClient) ListEventsByAppointment(ctx context.Context, accessToken string, appointmentID string) ([]string, error) {
	requestURL, err := url.Parse(googleCalendarEventsURL)
	if err != nil {
		return nil, err
	}
	query := requestURL.Query()
	query.Set("privateExtendedProperty", "turnoflowAppointmentId="+appointmentID)
	query.Set("showDeleted", "false")
	query.Set("singleEvents", "false")
	requestURL.RawQuery = query.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL.String(), nil)
	if err != nil {
		return nil, err
	}
	authorizeGoogleRequest(request, accessToken)

	response, err := client.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, googleCalendarError(response)
	}

	var result struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode google calendar list response: %w", err)
	}

	eventIDs := make([]string, 0, len(result.Items))
	for _, item := range result.Items {
		if item.ID != "" {
			eventIDs = append(eventIDs, item.ID)
		}
	}

	return eventIDs, nil
}

func (client *GoogleCalendarClient) RefreshAccessToken(ctx context.Context, refreshToken string) (CalendarToken, error) {
	body := url.Values{}
	body.Set("client_id", client.clientID)
	body.Set("client_secret", client.clientSecret)
	body.Set("grant_type", "refresh_token")
	body.Set("refresh_token", refreshToken)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, bytes.NewBufferString(body.Encode()))
	if err != nil {
		return CalendarToken{}, err
	}
	request.Header.Set("content-type", "application/x-www-form-urlencoded")

	response, err := client.client.Do(request)
	if err != nil {
		return CalendarToken{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return CalendarToken{}, googleCalendarError(response)
	}

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return CalendarToken{}, fmt.Errorf("decode google token refresh response: %w", err)
	}
	if result.AccessToken == "" {
		return CalendarToken{}, fmt.Errorf("google token refresh response did not include access token")
	}

	return CalendarToken{
		AccessToken: result.AccessToken,
		ExpiresAt:   time.Now().UTC().Add(time.Duration(result.ExpiresIn) * time.Second),
	}, nil
}

func authorizeGoogleRequest(request *http.Request, accessToken string) {
	request.Header.Set("authorization", "Bearer "+accessToken)
	if request.Method != http.MethodGet {
		request.Header.Set("content-type", "application/json")
	}
}

func googleEventBody(event CalendarEvent) map[string]any {
	return map[string]any{
		"description": event.Description,
		"end": map[string]string{
			"dateTime": googleEventDateTime(event.EndsAt, event.Timezone),
			"timeZone": event.Timezone,
		},
		"extendedProperties": map[string]any{
			"private": map[string]string{
				"turnoflowAppointmentId": event.AppointmentID,
			},
		},
		"start": map[string]string{
			"dateTime": googleEventDateTime(event.StartsAt, event.Timezone),
			"timeZone": event.Timezone,
		},
		"summary": event.Summary,
	}
}

func googleEventDateTime(value time.Time, timezone string) string {
	location, err := time.LoadLocation(timezone)
	if err != nil {
		return value.UTC().Format(time.RFC3339)
	}

	return value.In(location).Format(time.RFC3339)
}

func googleCalendarError(response *http.Response) error {
	var body struct {
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
		Details          struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Errors  []struct {
				Message string `json:"message"`
				Reason  string `json:"reason"`
			} `json:"errors"`
			Status string `json:"status"`
		} `json:"error"`
	}
	_ = json.NewDecoder(response.Body).Decode(&body)

	code := body.Error
	message := body.ErrorDescription

	if body.Details.Status != "" {
		code = body.Details.Status
	}
	if body.Details.Message != "" {
		message = body.Details.Message
	}
	if message == "" && len(body.Details.Errors) > 0 {
		message = body.Details.Errors[0].Message
	}
	if message == "" {
		message = response.Status
	}

	return CalendarError{
		Code:       code,
		Message:    message,
		StatusCode: response.StatusCode,
	}
}
