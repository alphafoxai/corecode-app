package model

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// userPaidCacheTTL bounds how stale the concurrency tier of a user who just
// paid can be. Opening the wallet reads the total afresh and refreshes it.
const userPaidCacheTTL = 5 * time.Minute

type userPaidEntry struct {
	paid      float64
	fetchedAt time.Time
}

var userPaidCache = struct {
	sync.Mutex
	entries map[int]userPaidEntry
}{entries: map[int]userPaidEntry{}}

// CachedUserPaidMoney returns what a user paid through payment gateways,
// read at most userPaidCacheTTL ago. The per-user concurrency limit asks on
// every relay request. A failed read keeps the last value, or 0.
func CachedUserPaidMoney(userID int) float64 {
	userPaidCache.Lock()
	entry, ok := userPaidCache.entries[userID]
	userPaidCache.Unlock()
	if ok && time.Since(entry.fetchedAt) < userPaidCacheTTL {
		return entry.paid
	}
	paid, err := RefreshUserPaidMoney(userID)
	if err != nil {
		common.SysError(common.LogText("failed to read paid total of user %d: %s", userID, err.Error()))
		return entry.paid
	}
	return paid
}

// RefreshUserPaidMoney reads a user's paid total from the database and
// caches it.
func RefreshUserPaidMoney(userID int) (float64, error) {
	paid, err := AffiliatePaidMoney(DB, userID)
	if err != nil {
		return 0, err
	}
	userPaidCache.Lock()
	userPaidCache.entries[userID] = userPaidEntry{paid: paid, fetchedAt: time.Now()}
	userPaidCache.Unlock()
	return paid, nil
}
