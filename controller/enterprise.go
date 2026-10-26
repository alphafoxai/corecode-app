package controller

import (
	"errors"
	"html"
	"net/http"
	"net/mail"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const enterpriseLongTextLimit = 2000

// enterpriseSpendLabels names each band in the administrators' notice.
var enterpriseSpendLabels = map[string]string{
	model.EnterpriseSpendUnder1K:  "< $1,000",
	model.EnterpriseSpend1KTo5K:   "$1,000 - $5,000",
	model.EnterpriseSpend5KTo20K:  "$5,000 - $20,000",
	model.EnterpriseSpend20KTo50K: "$20,000 - $50,000",
	model.EnterpriseSpendOver50K:  "> $50,000",
}

// notifyEnterpriseApplication tells administrators about a new application
// without holding up the visitor's response. Tests replace it.
var notifyEnterpriseApplication = func(applicationId int, render func(lang string) (string, string)) {
	gopool.Go(func() {
		service.NotifyEnterpriseApplicationWatchers(applicationId, render)
	})
}

type enterpriseApplicationRequest struct {
	Company      string `json:"company"`
	ContactName  string `json:"contact_name"`
	Email        string `json:"email"`
	OtherContact string `json:"other_contact"`
	MonthlySpend string `json:"monthly_spend"`
	UseCase      string `json:"use_case"`
	Message      string `json:"message"`
}

type enterpriseApplicationUpdateRequest struct {
	Status    string `json:"status"`
	AdminNote string `json:"admin_note"`
}

// validEnterpriseEmail accepts a bare address such as name@example.com and
// rejects display names and angle brackets.
func validEnterpriseEmail(email string) bool {
	if email == "" || len(email) > 254 {
		return false
	}
	address, err := mail.ParseAddress(email)
	return err == nil && address.Name == "" && address.Address == email
}

// SubmitEnterpriseApplication files a team's request for enterprise pricing
// from the public enterprise page. Visitors need no account; a signed-in
// submitter is recorded with the application.
func SubmitEnterpriseApplication(c *gin.Context) {
	var request enterpriseApplicationRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	application := model.EnterpriseApplication{
		Company:      strings.TrimSpace(request.Company),
		ContactName:  strings.TrimSpace(request.ContactName),
		Email:        strings.TrimSpace(request.Email),
		OtherContact: strings.TrimSpace(request.OtherContact),
		MonthlySpend: request.MonthlySpend,
		UseCase:      strings.TrimSpace(request.UseCase),
		Message:      strings.TrimSpace(request.Message),
		UserId:       c.GetInt("id"),
		Ip:           c.ClientIP(),
	}
	if application.Company == "" || utf8.RuneCountInString(application.Company) > 128 ||
		application.ContactName == "" || utf8.RuneCountInString(application.ContactName) > 64 ||
		utf8.RuneCountInString(application.OtherContact) > 128 ||
		utf8.RuneCountInString(application.UseCase) > enterpriseLongTextLimit ||
		utf8.RuneCountInString(application.Message) > enterpriseLongTextLimit ||
		!slices.Contains(model.EnterpriseSpendBands, application.MonthlySpend) {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if !validEnterpriseEmail(application.Email) {
		common.ApiErrorT(c, "Invalid email address")
		return
	}

	recent, err := model.CountEnterpriseApplicationsSince(application.Ip, time.Now().Add(-time.Hour).Unix())
	if err != nil {
		common.SysError(common.LogText("enterprise application throttle lookup failed: %v", err))
		common.ApiErrorT(c, "Database error, please contact the administrator")
		return
	}
	if recent >= model.EnterpriseMaxPerIPPerHour {
		common.ApiErrorStatus(c, http.StatusTooManyRequests, common.NewMessage("Too many applications, please try again later."))
		return
	}
	if err := application.Insert(); err != nil {
		common.SysError(common.LogText("failed to save enterprise application: %v", err))
		common.ApiErrorT(c, "Database error, please contact the administrator")
		return
	}

	// The notice is an HTML email, so every value the visitor typed is escaped.
	values := map[string]any{
		"Company":      html.EscapeString(application.Company),
		"ContactName":  html.EscapeString(application.ContactName),
		"Email":        html.EscapeString(application.Email),
		"OtherContact": html.EscapeString(application.OtherContact),
		"MonthlySpend": enterpriseSpendLabels[application.MonthlySpend],
		"UseCase":      html.EscapeString(application.UseCase),
		"Message":      html.EscapeString(application.Message),
	}
	notifyEnterpriseApplication(application.Id, func(lang string) (string, string) {
		return i18n.Translate(lang, i18n.MsgEnterpriseApplicationSubject, values),
			i18n.Translate(lang, i18n.MsgEnterpriseApplicationContent, values)
	})
	common.ApiSuccessT(c, "Application submitted", nil)
}

// GetEnterpriseApplications pages the applications for administrators,
// filtered by status and a keyword on company, contact name or email.
func GetEnterpriseApplications(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	applications, total, err := model.ListEnterpriseApplications(model.EnterpriseApplicationFilter{
		Status:  c.Query("status"),
		Keyword: c.Query("keyword"),
	}, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(applications)
	common.ApiSuccess(c, pageInfo)
}

// UpdateEnterpriseApplication records an administrator's status and note on
// an application.
func UpdateEnterpriseApplication(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	var request enterpriseApplicationUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	note := strings.TrimSpace(request.AdminNote)
	if !slices.Contains(model.EnterpriseStatuses, request.Status) || utf8.RuneCountInString(note) > enterpriseLongTextLimit {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if err := model.UpdateEnterpriseApplication(id, request.Status, note); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorT(c, "Application not found")
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
