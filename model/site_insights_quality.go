package model

import (
	"cmp"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// ModelQuality is one model's latency over successful requests. TTFT is the
// first-response time of streamed requests.
type ModelQuality struct {
	Model      string  `json:"model"`
	Requests   int64   `json:"requests"`
	Errors     int64   `json:"errors"`
	ErrorRate  float64 `json:"error_rate"`
	TTFTP50    int64   `json:"ttft_p50_ms"`
	TTFTP95    int64   `json:"ttft_p95_ms"`
	LatencyP50 int64   `json:"latency_p50_s"`
	LatencyP95 int64   `json:"latency_p95_s"`
	CacheShare float64 `json:"cache_share"`
}

// CacheDay is one day of input tokens split by how the cache served them.
type CacheDay struct {
	Day        int64   `json:"day"`
	Read       int64   `json:"read"`
	Write      int64   `json:"write"`
	Uncached   int64   `json:"uncached"`
	ReadShare  float64 `json:"read_share"`
	TTFTP50    int64   `json:"ttft_p50_ms"`
	ErrorRate  float64 `json:"error_rate"`
	Requests   int64   `json:"requests"`
	ErrorCount int64   `json:"errors"`
}

// QualityInsights reads latency, cache use and failures from the request
// logs. Unlike the performance panel it counts every logged failure,
// including requests the pool turned away.
type QualityInsights struct {
	Requests     int64          `json:"requests"`
	Errors       int64          `json:"errors"`
	ErrorRate    float64        `json:"error_rate"`
	TTFTP50      int64          `json:"ttft_p50_ms"`
	TTFTP95      int64          `json:"ttft_p95_ms"`
	CacheShare   float64        `json:"cache_share"`
	Models       []ModelQuality `json:"models"`
	Daily        []CacheDay     `json:"daily"`
	StreamEnds   []NamedCount   `json:"stream_ends"`
	StatusCodes  []NamedCount   `json:"status_codes"`
	ErrorReasons []NamedCount   `json:"error_reasons"`
	Truncated    bool           `json:"truncated"`
}

// logOtherFields is the part of a log's other column the quality and
// business views read.
type logOtherFields struct {
	Frt                 float64 `json:"frt"`
	CacheTokens         int64   `json:"cache_tokens"`
	CacheCreationTokens int64   `json:"cache_creation_tokens"`
	StreamStatus        struct {
		EndReason string `json:"end_reason"`
	} `json:"stream_status"`
	AdminInfo struct {
		Client string `json:"client"`
	} `json:"admin_info"`
}

func parseLogOther(other string) logOtherFields {
	var fields logOtherFields
	if other != "" {
		_ = common.UnmarshalJsonStr(other, &fields)
	}
	return fields
}

func percentile(sorted []int64, p float64) int64 {
	if len(sorted) == 0 {
		return 0
	}
	return sorted[min(len(sorted)-1, int(float64(len(sorted))*p))]
}

// errorReason shortens an error log to its first clause, for grouping.
func errorReason(content string) string {
	reason := content
	if _, rest, ok := strings.Cut(content, ", "); ok && strings.HasPrefix(content, "status_code=") {
		reason = rest
	}
	if cut := strings.IndexAny(reason, ".\n"); cut > 0 {
		reason = reason[:cut]
	}
	if len(reason) > 80 {
		reason = reason[:80]
	}
	return reason
}

func GetQualityInsights(r InsightsRange) (*QualityInsights, error) {
	logs, truncated, err := readInsightLogs(r, true, LogTypeConsume, LogTypeError)
	if err != nil {
		return nil, err
	}
	result := &QualityInsights{Truncated: truncated}
	type modelBucket struct {
		quality       ModelQuality
		ttft, latency []int64
		cache, input  int64
	}
	models := make(map[string]*modelBucket)
	type dayBucket struct {
		day  CacheDay
		ttft []int64
	}
	days := make(map[int64]*dayBucket)
	for _, day := range r.days() {
		days[day] = &dayBucket{day: CacheDay{Day: day}}
	}
	streamEnds := make(map[string]int64)
	statusCodes := make(map[string]int64)
	reasons := make(map[string]int64)
	var allTTFT []int64
	var cacheRead, inputTotal int64
	for _, log := range logs {
		bucket := models[log.ModelName]
		if bucket == nil {
			bucket = &modelBucket{quality: ModelQuality{Model: log.ModelName}}
			models[log.ModelName] = bucket
		}
		day := days[r.DayStart(log.CreatedAt)]
		result.Requests++
		bucket.quality.Requests++
		if day != nil {
			day.day.Requests++
		}
		if log.Type == LogTypeError {
			result.Errors++
			bucket.quality.Errors++
			if day != nil {
				day.day.ErrorCount++
			}
			code := logStatusCode(log.Content)
			statusCodes[statusCodeName(code)]++
			reasons[errorReason(log.Content)]++
			continue
		}
		other := parseLogOther(log.Other)
		bucket.latency = append(bucket.latency, int64(log.UseTime))
		if log.IsStream && other.Frt > 0 {
			ttft := int64(other.Frt)
			bucket.ttft = append(bucket.ttft, ttft)
			allTTFT = append(allTTFT, ttft)
			if day != nil {
				day.ttft = append(day.ttft, ttft)
			}
		}
		if log.IsStream {
			reason := other.StreamStatus.EndReason
			if reason == "" {
				reason = "unknown"
			}
			streamEnds[reason]++
		}
		input := int64(log.PromptTokens) + other.CacheTokens + other.CacheCreationTokens
		bucket.cache += other.CacheTokens
		bucket.input += input
		cacheRead += other.CacheTokens
		inputTotal += input
		if day != nil {
			day.day.Read += other.CacheTokens
			day.day.Write += other.CacheCreationTokens
			day.day.Uncached += int64(log.PromptTokens)
		}
	}
	slices.Sort(allTTFT)
	result.TTFTP50, result.TTFTP95 = percentile(allTTFT, 0.5), percentile(allTTFT, 0.95)
	result.ErrorRate = ratio(float64(result.Errors), float64(result.Requests))
	result.CacheShare = ratio(float64(cacheRead), float64(inputTotal))
	for _, bucket := range models {
		slices.Sort(bucket.ttft)
		slices.Sort(bucket.latency)
		quality := bucket.quality
		quality.ErrorRate = ratio(float64(quality.Errors), float64(quality.Requests))
		quality.TTFTP50, quality.TTFTP95 = percentile(bucket.ttft, 0.5), percentile(bucket.ttft, 0.95)
		quality.LatencyP50, quality.LatencyP95 = percentile(bucket.latency, 0.5), percentile(bucket.latency, 0.95)
		quality.CacheShare = ratio(float64(bucket.cache), float64(bucket.input))
		result.Models = append(result.Models, quality)
	}
	slices.SortFunc(result.Models, func(a, b ModelQuality) int {
		return cmp.Or(cmp.Compare(b.Requests, a.Requests), cmp.Compare(a.Model, b.Model))
	})
	for _, bucket := range days {
		slices.Sort(bucket.ttft)
		bucket.day.TTFTP50 = percentile(bucket.ttft, 0.5)
		bucket.day.ReadShare = ratio(float64(bucket.day.Read), float64(bucket.day.Read+bucket.day.Write+bucket.day.Uncached))
		bucket.day.ErrorRate = ratio(float64(bucket.day.ErrorCount), float64(bucket.day.Requests))
		result.Daily = append(result.Daily, bucket.day)
	}
	slices.SortFunc(result.Daily, func(a, b CacheDay) int { return cmp.Compare(a.Day, b.Day) })
	result.StreamEnds = sortedCounts(streamEnds)
	result.StatusCodes = sortedCounts(statusCodes)
	result.ErrorReasons = sortedCounts(reasons)
	if len(result.ErrorReasons) > 15 {
		result.ErrorReasons = result.ErrorReasons[:15]
	}
	return result, nil
}

func statusCodeName(code int) string {
	if code == 0 {
		return "unknown"
	}
	return strconv.Itoa(code)
}
