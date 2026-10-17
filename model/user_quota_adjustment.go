package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

var (
	ErrInvalidUserQuotaAdjustment = errors.New("invalid user quota adjustment")
	ErrUserQuotaPermission        = errors.New("cannot adjust quota for this user role")
	// ErrIdempotencyKeyMismatch rejects a reused key whose user, mode or value differs from its first use.
	ErrIdempotencyKeyMismatch = errors.New("idempotency key was already used with different parameters")
	// errQuotaAdjustmentKeyInsert marks a failed key insert. The caller re-reads the key: a concurrent winner may own it.
	errQuotaAdjustmentKeyInsert = errors.New("insert quota adjustment key")
)

// UserQuotaAdjustment is the immutable database snapshot of a committed manual
// adjustment. Pending relay deductions in the quota cache are not part of it.
type UserQuotaAdjustment struct {
	UserID   int
	Username string
	Before   int
	After    int
}

// UserQuotaAdjustmentRequest is one manual adjustment. An empty IdempotencyKey
// keeps the adjustment non-idempotent.
type UserQuotaAdjustmentRequest struct {
	UserID         int
	OperatorID     int
	OperatorRole   int
	Mode           string
	Value          int
	IdempotencyKey string
}

// UserQuotaAdjustmentResult reports an adjustment. Replayed means an earlier
// request already applied the key: the balance was not changed and nothing was
// recorded this time.
type UserQuotaAdjustmentResult struct {
	UserQuotaAdjustment
	Replayed bool
}

// QuotaAdjustmentRequest records a manual adjustment made with an Idempotency-Key.
// Its row commits in the same transaction as the balance change it describes.
type QuotaAdjustmentRequest struct {
	Id             int    `json:"id"`
	IdempotencyKey string `json:"idempotency_key" gorm:"type:varchar(128);uniqueIndex"`
	UserId         int    `json:"user_id" gorm:"index"`
	Mode           string `json:"mode" gorm:"type:varchar(16)"`
	Value          int    `json:"value"`
	BeforeQuota    int    `json:"before_quota"`
	AfterQuota     int    `json:"after_quota"`
	OperatorId     int    `json:"operator_id"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint"`
}

func (stored QuotaAdjustmentRequest) matches(req UserQuotaAdjustmentRequest) bool {
	return stored.UserId == req.UserID && stored.Mode == req.Mode && stored.Value == req.Value
}

func findQuotaAdjustmentRequest(db *gorm.DB, key string) (*QuotaAdjustmentRequest, error) {
	var rows []QuotaAdjustmentRequest
	if err := db.Where("idempotency_key = ?", key).Limit(1).Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// AdjustUserQuota applies a manual adjustment. With an IdempotencyKey the key row
// commits in the same transaction as the balance change, so the key is applied at
// most once. Reusing it with the same user, mode and value replays without effect;
// reusing it with anything else fails with ErrIdempotencyKeyMismatch.
func AdjustUserQuota(req UserQuotaAdjustmentRequest) (*UserQuotaAdjustmentResult, error) {
	if req.UserID <= 0 || (req.Mode != "add" && req.Mode != "subtract" && req.Mode != "override") {
		return nil, ErrInvalidUserQuotaAdjustment
	}
	if req.Mode != "override" && req.Value <= 0 {
		return nil, ErrInvalidUserQuotaAdjustment
	}
	if req.Value > common.MaxWalletQuota || req.Value < -common.MaxWalletQuota {
		return nil, ErrWalletQuotaLimitExceeded
	}

	var result UserQuotaAdjustmentResult
	err := applyUserQuotaAdjustment(req, &result)
	if err != nil && req.IdempotencyKey != "" && errors.Is(err, errQuotaAdjustmentKeyInsert) {
		// A concurrent request with the same key committed its row first. That row
		// decides the outcome; this attempt's balance change was rolled back with it.
		stored, lookupErr := findQuotaAdjustmentRequest(DB, req.IdempotencyKey)
		if lookupErr != nil {
			return nil, lookupErr
		}
		if stored == nil {
			return nil, err
		}
		if !stored.matches(req) {
			return nil, ErrIdempotencyKeyMismatch
		}
		result = UserQuotaAdjustmentResult{
			UserQuotaAdjustment: UserQuotaAdjustment{UserID: req.UserID, Before: stored.BeforeQuota, After: stored.AfterQuota},
			Replayed:            true,
		}
		err = nil
	}
	if err != nil {
		return nil, err
	}
	if !result.Replayed {
		// Apply only the committed difference, preserving outstanding reservations.
		// Both balances are bounded above, so their difference fits in int64.
		delta := int64(result.After) - int64(result.Before)
		if delta != 0 {
			if err := cacheIncrUserQuota(req.UserID, delta); err != nil {
				common.SysError(common.LogText("failed to sync manual quota adjustment for user %d: %s", req.UserID, err))
			}
		}
	}
	return &result, nil
}

func applyUserQuotaAdjustment(req UserQuotaAdjustmentRequest, result *UserQuotaAdjustmentResult) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, req.UserID).Error; err != nil {
			return err
		}
		if req.OperatorRole != common.RoleRootUser && req.OperatorRole <= user.Role {
			return ErrUserQuotaPermission
		}
		if req.IdempotencyKey != "" {
			stored, err := findQuotaAdjustmentRequest(tx, req.IdempotencyKey)
			if err != nil {
				return err
			}
			if stored != nil {
				if !stored.matches(req) {
					return ErrIdempotencyKeyMismatch
				}
				*result = UserQuotaAdjustmentResult{
					UserQuotaAdjustment: UserQuotaAdjustment{UserID: user.Id, Username: user.Username, Before: stored.BeforeQuota, After: stored.AfterQuota},
					Replayed:            true,
				}
				return nil
			}
		}
		if user.Quota > common.MaxWalletQuota || user.Quota < -common.MaxWalletQuota {
			return ErrWalletQuotaLimitExceeded
		}
		quota := decimal.NewFromInt(int64(req.Value))
		switch req.Mode {
		case "add":
			quota = decimal.NewFromInt(int64(user.Quota)).Add(quota)
		case "subtract":
			quota = decimal.NewFromInt(int64(user.Quota)).Sub(quota)
		}
		after, err := common.WalletQuotaFromDecimalStrict(quota)
		if err != nil {
			return ErrWalletQuotaLimitExceeded
		}
		// An unchanged override is a successful operation, including on MySQL
		// configurations that count only changed rows in RowsAffected.
		if after != user.Quota {
			updated := tx.Model(&User{}).Where("id = ?", req.UserID).Update("quota", after)
			if updated.Error != nil {
				return updated.Error
			}
			if updated.RowsAffected != 1 {
				return gorm.ErrRecordNotFound
			}
		}
		if req.IdempotencyKey != "" {
			record := QuotaAdjustmentRequest{
				IdempotencyKey: req.IdempotencyKey,
				UserId:         req.UserID,
				Mode:           req.Mode,
				Value:          req.Value,
				BeforeQuota:    user.Quota,
				AfterQuota:     after,
				OperatorId:     req.OperatorID,
				CreatedAt:      common.GetTimestamp(),
			}
			if err := tx.Create(&record).Error; err != nil {
				return fmt.Errorf("%w: %w", errQuotaAdjustmentKeyInsert, err)
			}
		}
		*result = UserQuotaAdjustmentResult{
			UserQuotaAdjustment: UserQuotaAdjustment{UserID: user.Id, Username: user.Username, Before: user.Quota, After: after},
		}
		return nil
	})
}
