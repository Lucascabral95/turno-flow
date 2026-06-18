package postgres

import (
	"strings"
	"testing"
)

func TestNotificationLogSQLStoresAttemptsAndSentAtConditionally(t *testing.T) {
	sql := notificationLogSQL()

	for _, expected := range []string{
		"INSERT INTO notification_logs",
		"business_id",
		"notification_id",
		"appointment_id",
		"waitlist_entry_id",
		"attempts",
		"sent_at",
		"CASE WHEN $7::notification_status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END",
	} {
		if !strings.Contains(sql, expected) {
			t.Fatalf("expected SQL to contain %q, got %s", expected, sql)
		}
	}
}

func TestNotificationLogSQLUsesSevenBoundParameters(t *testing.T) {
	sql := notificationLogSQL()

	for _, expected := range []string{"$1", "$2", "$3", "$4", "$5", "$6", "$7", "$8", "$9"} {
		if !strings.Contains(sql, expected) {
			t.Fatalf("expected SQL to contain placeholder %s, got %s", expected, sql)
		}
	}
	if strings.Contains(sql, "$10") {
		t.Fatalf("expected SQL not to contain a tenth placeholder, got %s", sql)
	}
}
