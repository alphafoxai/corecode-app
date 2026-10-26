package model

import (
	"cmp"
	"slices"
)

// CapacityHour is one hour of the capacity view.
type CapacityHour struct {
	Hour              int64 `json:"hour"`
	Requests          int64 `json:"requests"`
	Errors            int64 `json:"errors"`
	PeakConcurrency   int   `json:"peak_concurrency"`
	EngineRejections  int64 `json:"engine_rejections"`
	UpstreamRateLimit int64 `json:"upstream_rate_limits"`
}

// UserPeak is the most requests one user had in flight at once.
type UserPeak struct {
	UserRef
	Peak     int   `json:"peak"`
	PeakAt   int64 `json:"peak_at"`
	Requests int64 `json:"requests"`
}

// CapacityInsights reconstructs concurrency from the request logs: a log is
// written when a request ends, so it was in flight from created_at - use_time
// to created_at. Requests rejected before reaching the relay, such as the
// per-user concurrency limit, are not in the logs; the controller adds those
// from the limiter itself.
type CapacityInsights struct {
	Requests        int64          `json:"requests"`
	Errors          int64          `json:"errors"`
	PeakConcurrency int            `json:"peak_concurrency"`
	PeakAt          int64          `json:"peak_at"`
	PeakRPM         int64          `json:"peak_rpm"`
	PeakRPMAt       int64          `json:"peak_rpm_at"`
	ErrorCategories []NamedCount   `json:"error_categories"`
	Hourly          []CapacityHour `json:"hourly"`
	UserPeaks       []UserPeak     `json:"user_peaks"`
	Truncated       bool           `json:"truncated"`
}

type concurrencyEvent struct {
	at     int64
	delta  int
	userID int
}

func GetCapacityInsights(r InsightsRange) (*CapacityInsights, error) {
	logs, truncated, err := readInsightLogs(r, false, LogTypeConsume, LogTypeError)
	if err != nil {
		return nil, err
	}
	result := &CapacityInsights{Truncated: truncated}
	hours := make(map[int64]*CapacityHour)
	hourOf := func(at int64) *CapacityHour {
		start := r.HourStart(at)
		hour := hours[start]
		if hour == nil {
			hour = &CapacityHour{Hour: start}
			hours[start] = hour
		}
		return hour
	}
	for at := r.HourStart(r.Start); at < r.End; at += 3600 {
		hourOf(at)
	}
	categories := make(map[string]int64)
	perMinute := make(map[int64]int64)
	users := make(map[int]*UserPeak)
	events := make([]concurrencyEvent, 0, len(logs)*2)
	for _, log := range logs {
		end := log.CreatedAt
		start := end - int64(max(log.UseTime, 0))
		hour := hourOf(start)
		hour.Requests++
		result.Requests++
		perMinute[start-((start%60)+60)%60]++
		if log.Type == LogTypeError {
			category := classifyErrorLog(log.Content)
			categories[category]++
			hour.Errors++
			result.Errors++
			switch category {
			case ErrorEngineConcurrency:
				hour.EngineRejections++
			case ErrorUpstreamRateLimit:
				hour.UpstreamRateLimit++
			}
		}
		user := users[log.UserId]
		if user == nil {
			user = &UserPeak{UserRef: UserRef{UserID: log.UserId, Username: log.Username}}
			users[log.UserId] = user
		}
		user.Requests++
		// use_time is whole seconds; a request under a second still held a
		// slot, so it ends one second after it starts.
		if end <= start {
			end = start + 1
		}
		events = append(events, concurrencyEvent{start, 1, log.UserId}, concurrencyEvent{end, -1, log.UserId})
	}
	// Ends sort before starts at the same second, so back-to-back requests
	// are not counted as overlapping.
	slices.SortFunc(events, func(a, b concurrencyEvent) int {
		return cmp.Or(cmp.Compare(a.at, b.at), cmp.Compare(a.delta, b.delta))
	})
	current := 0
	perUser := make(map[int]int)
	for _, event := range events {
		current += event.delta
		perUser[event.userID] += event.delta
		if event.delta < 0 {
			continue
		}
		if hour := hourOf(event.at); current > hour.PeakConcurrency {
			hour.PeakConcurrency = current
		}
		if current > result.PeakConcurrency {
			result.PeakConcurrency, result.PeakAt = current, event.at
		}
		if user := users[event.userID]; perUser[event.userID] > user.Peak {
			user.Peak, user.PeakAt = perUser[event.userID], event.at
		}
	}
	for minute, count := range perMinute {
		if count > result.PeakRPM || count == result.PeakRPM && minute < result.PeakRPMAt {
			result.PeakRPM, result.PeakRPMAt = count, minute
		}
	}
	result.ErrorCategories = sortedCounts(categories)
	result.Hourly = make([]CapacityHour, 0, len(hours))
	for _, hour := range hours {
		if hour.Hour >= r.HourStart(r.Start) && hour.Hour < r.End {
			result.Hourly = append(result.Hourly, *hour)
		}
	}
	slices.SortFunc(result.Hourly, func(a, b CapacityHour) int { return cmp.Compare(a.Hour, b.Hour) })
	result.UserPeaks = make([]UserPeak, 0, len(users))
	for _, user := range users {
		result.UserPeaks = append(result.UserPeaks, *user)
	}
	slices.SortFunc(result.UserPeaks, func(a, b UserPeak) int {
		return cmp.Or(cmp.Compare(b.Peak, a.Peak), cmp.Compare(b.Requests, a.Requests))
	})
	if len(result.UserPeaks) > insightsTopN*2 {
		result.UserPeaks = result.UserPeaks[:insightsTopN*2]
	}
	return result, nil
}
