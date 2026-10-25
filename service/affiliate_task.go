package service

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	affiliateSettleTickInterval = time.Hour
	affiliateSettleBatchSize    = 300
)

var (
	affiliateSettleOnce    sync.Once
	affiliateSettleRunning atomic.Bool
)

// StartAffiliateSettlementTask settles invite commission every hour on the
// master node. Settlement is idempotent per invitee, so a second instance
// running it would pay nothing twice.
func StartAffiliateSettlementTask() {
	affiliateSettleOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), common.LogText("affiliate settlement task started: tick=%s", affiliateSettleTickInterval))
			ticker := time.NewTicker(affiliateSettleTickInterval)
			defer ticker.Stop()

			RunAffiliateSettlementOnce()
			for range ticker.C {
				RunAffiliateSettlementOnce()
			}
		})
	})
}

// RunAffiliateSettlementOnce starts counting for invitees that have no
// referral yet, then settles every invitee whose consumption grew. With the
// program off it still moves the marks, so consumption while it was off never
// earns commission later.
func RunAffiliateSettlementOnce() {
	if !affiliateSettleRunning.CompareAndSwap(false, true) {
		return
	}
	defer affiliateSettleRunning.Store(false)

	ctx := context.Background()
	if operation_setting.GetAffiliateSetting().Enabled {
		for {
			started, err := model.StartMissingAffiliateReferrals(affiliateSettleBatchSize)
			if err != nil {
				logger.LogWarn(ctx, common.LogText("affiliate referral start failed: %v", err))
				return
			}
			if started < affiliateSettleBatchSize {
				break
			}
		}
	}
	settled, credited, afterId := 0, 0, 0
	for {
		userIds, next, err := model.AffiliateReferralsToSettle(afterId, affiliateSettleBatchSize)
		if err != nil {
			logger.LogWarn(ctx, common.LogText("affiliate settlement query failed: %v", err))
			return
		}
		for _, userId := range userIds {
			paid, err := model.SettleAffiliateReferral(userId)
			if err != nil {
				logger.LogWarn(ctx, common.LogText("affiliate settlement failed for user %d: %v", userId, err))
				continue
			}
			settled++
			if paid {
				credited++
			}
		}
		if len(userIds) < affiliateSettleBatchSize {
			break
		}
		afterId = next
	}
	if settled > 0 {
		logger.LogInfo(ctx, common.LogText("affiliate settlement: settled=%d credited=%d", settled, credited))
	}
}
