package domain

import "time"

type RecurringSeries struct {
	ID                 string
	BusinessID         string
	CustomerID         string
	CustomerEmail      string
	CustomerName       string
	CustomerPhone      *string
	ServiceID          string
	ServiceName        string
	ServiceDurationMin int
	StaffMemberID      string
	StaffMemberName    string
	IntervalValue      int
	IntervalUnit       string
	NextOccurrenceAt   time.Time
	AdvanceNoticeDays  int
	MaxOccurrences     *int
	OccurrencesCreated int
}
