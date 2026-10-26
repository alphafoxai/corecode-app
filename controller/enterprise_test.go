package controller

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// useEnterpriseTestDB points the model at a fresh enterprise_applications
// table on dialect. MySQL and PostgreSQL run when TEST_MYSQL_DSN or
// TEST_POSTGRES_DSN names an empty database.
func useEnterpriseTestDB(t *testing.T, dialect string) {
	t.Helper()
	var driver gorm.Dialector
	switch dialect {
	case "sqlite":
		driver = sqlite.Open(":memory:")
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN is not configured")
		}
		driver = mysql.Open(dsn)
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN is not configured")
		}
		driver = postgres.Open(dsn)
	}
	db, err := gorm.Open(driver, &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
	require.False(t, db.Migrator().HasTable(&model.EnterpriseApplication{}), "use an empty test database")
	require.NoError(t, db.AutoMigrate(&model.EnterpriseApplication{}))
	// A second migration must find nothing to change.
	require.NoError(t, db.AutoMigrate(&model.EnterpriseApplication{}))
	previousNotify := notifyEnterpriseApplication
	notifyEnterpriseApplication = func(int, func(string) (string, string)) {}
	t.Cleanup(func() {
		notifyEnterpriseApplication = previousNotify
		require.NoError(t, db.Migrator().DropTable(&model.EnterpriseApplication{}))
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		require.NoError(t, sqlDB.Close())
	})
}

func callEnterprise(t *testing.T, handler gin.HandlerFunc, method, target, body string, userId int) (int, map[string]any) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(method, target, strings.NewReader(body))
	c.Request.RemoteAddr = "203.0.113.7:1234"
	if userId > 0 {
		c.Set("id", userId)
	}
	if _, id, ok := strings.Cut(target, "/applications/"); ok {
		c.Params = gin.Params{{Key: "id", Value: id}}
	}
	handler(c)
	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return recorder.Code, response
}

const validEnterpriseApplication = `{"company":" Acme Ltd ","contact_name":"Lin","email":"lin@acme.example","other_contact":"@lin","monthly_spend":"5k_20k","use_case":"Claude for code review"}`

func TestEnterpriseApplicationFlow(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useEnterpriseTestDB(t, dialect)

			_, response := callEnterprise(t, SubmitEnterpriseApplication, http.MethodPost, "/api/enterprise/apply", validEnterpriseApplication, 0)
			require.Equal(t, true, response["success"], response)
			_, response = callEnterprise(t, SubmitEnterpriseApplication, http.MethodPost, "/api/enterprise/apply",
				`{"company":"Beta","contact_name":"Kai","email":"kai@beta.example","monthly_spend":"over_50k"}`, 42)
			require.Equal(t, true, response["success"], response)

			var saved model.EnterpriseApplication
			require.NoError(t, model.DB.Where("company = ?", "Acme Ltd").First(&saved).Error)
			assert.Equal(t, model.EnterpriseStatusPending, saved.Status)
			assert.Equal(t, 0, saved.UserId)
			assert.Equal(t, "203.0.113.7", saved.Ip)
			assert.NotZero(t, saved.CreatedTime)

			_, response = callEnterprise(t, GetEnterpriseApplications, http.MethodGet, "/api/enterprise/applications?keyword=beta.example", "", 1)
			require.Equal(t, true, response["success"], response)
			page := response["data"].(map[string]any)
			assert.EqualValues(t, 1, page["total"])
			items := page["items"].([]any)
			require.Len(t, items, 1)
			assert.EqualValues(t, 42, items[0].(map[string]any)["user_id"])

			_, response = callEnterprise(t, UpdateEnterpriseApplication, http.MethodPatch,
				"/api/enterprise/applications/"+strconv.Itoa(saved.Id), `{"status":"contacted","admin_note":"quoted 15% off"}`, 1)
			require.Equal(t, true, response["success"], response)
			_, response = callEnterprise(t, GetEnterpriseApplications, http.MethodGet, "/api/enterprise/applications?status=contacted", "", 1)
			items = response["data"].(map[string]any)["items"].([]any)
			require.Len(t, items, 1)
			assert.Equal(t, "quoted 15% off", items[0].(map[string]any)["admin_note"])

			_, response = callEnterprise(t, UpdateEnterpriseApplication, http.MethodPatch,
				"/api/enterprise/applications/99999", `{"status":"won"}`, 1)
			assert.Equal(t, false, response["success"])
			_, response = callEnterprise(t, UpdateEnterpriseApplication, http.MethodPatch,
				"/api/enterprise/applications/"+strconv.Itoa(saved.Id), `{"status":"archived"}`, 1)
			assert.Equal(t, false, response["success"])
		})
	}
}

func TestSubmitEnterpriseApplicationRejectsInvalidInput(t *testing.T) {
	useEnterpriseTestDB(t, "sqlite")
	cases := map[string]string{
		"empty company":     `{"company":"  ","contact_name":"Lin","email":"lin@acme.example","monthly_spend":"1k_5k"}`,
		"display name mail": `{"company":"Acme","contact_name":"Lin","email":"Lin <lin@acme.example>","monthly_spend":"1k_5k"}`,
		"unknown band":      `{"company":"Acme","contact_name":"Lin","email":"lin@acme.example","monthly_spend":"lots"}`,
		"long message":      `{"company":"Acme","contact_name":"Lin","email":"lin@acme.example","monthly_spend":"1k_5k","message":"` + strings.Repeat("x", enterpriseLongTextLimit+1) + `"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			_, response := callEnterprise(t, SubmitEnterpriseApplication, http.MethodPost, "/api/enterprise/apply", body, 0)
			assert.Equal(t, false, response["success"])
		})
	}
	var count int64
	require.NoError(t, model.DB.Model(&model.EnterpriseApplication{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestSubmitEnterpriseApplicationEscapesTheAdministratorNotice(t *testing.T) {
	require.NoError(t, i18n.Init())
	useEnterpriseTestDB(t, "sqlite")
	var noticeId int
	var subject, content string
	notifyEnterpriseApplication = func(id int, render func(string) (string, string)) {
		noticeId = id
		subject, content = render("en")
	}

	_, response := callEnterprise(t, SubmitEnterpriseApplication, http.MethodPost, "/api/enterprise/apply",
		`{"company":"<b>Acme</b>","contact_name":"Lin","email":"lin@acme.example","monthly_spend":"over_50k","message":"<script>x</script>"}`, 0)
	require.Equal(t, true, response["success"], response)

	assert.NotZero(t, noticeId)
	assert.Contains(t, subject, "&lt;b&gt;Acme&lt;/b&gt;")
	assert.Contains(t, content, "&lt;script&gt;x&lt;/script&gt;")
	assert.NotContains(t, content, "<script>")
	assert.Contains(t, content, "> $50,000")
}

func TestSubmitEnterpriseApplicationThrottlesOneAddress(t *testing.T) {
	useEnterpriseTestDB(t, "sqlite")
	for range model.EnterpriseMaxPerIPPerHour {
		_, response := callEnterprise(t, SubmitEnterpriseApplication, http.MethodPost, "/api/enterprise/apply", validEnterpriseApplication, 0)
		require.Equal(t, true, response["success"], response)
	}
	status, response := callEnterprise(t, SubmitEnterpriseApplication, http.MethodPost, "/api/enterprise/apply", validEnterpriseApplication, 0)
	assert.Equal(t, http.StatusTooManyRequests, status)
	assert.Equal(t, false, response["success"])
}
