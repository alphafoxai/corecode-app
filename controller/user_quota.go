package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func manageUserQuota(c *gin.Context, req ManageRequest) {
	action := "generic"
	params := model.AuditFields{
		"target_user_id":  req.Id,
		"mode":            req.Mode,
		"requested_quota": req.Value,
	}
	switch req.Mode {
	case "add":
		action = "user.quota_add"
	case "subtract":
		action = "user.quota_subtract"
	case "override":
		action = "user.quota_override"
	default:
		params["action"] = "add_quota"
		params["method"] = c.Request.Method
		params["route"] = c.FullPath()
	}
	success := false
	defer func() {
		content := auditContentEN(action, params)
		if !success {
			// Failed requests have no committed balance changes to render.
			content = "Failed user quota adjustment"
		}
		model.RecordOperationAuditLog(c.GetInt("id"), c.GetInt("role"), content, c.ClientIP(), action, params,
			auditOperatorInfo(c), &model.AuditRequestInfo{
				Method: c.Request.Method, Route: c.FullPath(), Status: c.Writer.Status(), Success: success,
			}, c)
		markAuditLogged(c)
	}()

	idempotencyKey, ok := idempotencyKeyFromHeader(c.Request.Header.Values("Idempotency-Key"))
	if !ok {
		params["failure_reason"] = "invalid_idempotency_key"
		common.ApiErrorT(c, "Invalid idempotency key")
		return
	}

	result, err := model.AdjustUserQuota(model.UserQuotaAdjustmentRequest{
		UserID:         req.Id,
		OperatorID:     c.GetInt("id"),
		OperatorRole:   c.GetInt("role"),
		Mode:           req.Mode,
		Value:          req.Value,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		switch {
		case errors.Is(err, model.ErrInvalidUserQuotaAdjustment):
			params["failure_reason"] = "invalid_parameters"
			if (req.Mode == "add" || req.Mode == "subtract") && req.Value <= 0 {
				common.ApiErrorT(c, "Quota change amount cannot be zero")
			} else {
				common.ApiErrorT(c, "Invalid parameters")
			}
		case errors.Is(err, model.ErrUserQuotaPermission):
			params["failure_reason"] = "permission_denied"
			common.ApiErrorT(c, "No permission to update users of same or higher permission level")
		case errors.Is(err, model.ErrIdempotencyKeyMismatch):
			params["failure_reason"] = "idempotency_key_mismatch"
			common.ApiErrorT(c, "Idempotency key was already used with different parameters")
		case errors.Is(err, gorm.ErrRecordNotFound):
			params["failure_reason"] = "target_not_found"
			common.ApiErrorT(c, "User does not exist")
		case errors.Is(err, model.ErrWalletQuotaLimitExceeded):
			params["failure_reason"] = "quota_limit_exceeded"
			common.ApiError(c, err)
		default:
			params["failure_reason"] = "database_error"
			common.ApiError(c, err)
		}
		return
	}

	success = true
	if result.Replayed {
		// An earlier request applied this key. Nothing changes now, so no topup log
		// is written, and the audit entry records only the replay.
		action = "user.quota_replay"
		params["replayed"] = true
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"replayed": true}})
		return
	}

	params["target_username"] = result.Username
	params["from"] = result.Before
	params["to"] = result.After
	if req.Mode != "override" {
		params["quota"] = req.Value
	}
	operation := model.AuditOperation{Action: action, Params: params}
	model.RecordLogWithAdminInfo(result.UserID, model.LogTypeTopup,
		auditContentEN(action, params), auditOperatorInfo(c), &operation, c)
	if idempotencyKey == "" {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"replayed": false}})
}

// maxIdempotencyKeyLength bounds an Idempotency-Key header value.
const maxIdempotencyKeyLength = 128

// idempotencyKeyFromHeader returns the Idempotency-Key value. An absent header
// returns "" with ok=true. A present header must be exactly one value of 1 to 128
// printable ASCII bytes (0x21 to 0x7E); anything else returns ok=false.
func idempotencyKeyFromHeader(values []string) (string, bool) {
	if len(values) == 0 {
		return "", true
	}
	if len(values) > 1 {
		return "", false
	}
	key := values[0]
	if len(key) == 0 || len(key) > maxIdempotencyKeyLength {
		return "", false
	}
	for i := range len(key) {
		if key[i] < 0x21 || key[i] > 0x7e {
			return "", false
		}
	}
	return key, true
}
