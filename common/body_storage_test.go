package common

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/iotest"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewReplayableBodyReaderKeepsStorageLifecycleWithCaller(t *testing.T) {
	payload := []byte(`{"model":"test-model","input":"hello"}`)
	storage, err := CreateBodyStorage(payload)
	require.NoError(t, err)
	defer storage.Close()

	body := NewReplayableBodyReader(storage)
	assert.EqualValues(t, len(payload), body.Size())
	_, exposesCloser := any(body).(io.Closer)
	assert.False(t, exposesCloser, "the request body must not expose the storage closer")

	req, err := http.NewRequest(http.MethodPost, "https://example.com", body)
	require.NoError(t, err)
	require.NoError(t, req.Body.Close())

	replayBody, err := body.NewReader()
	require.NoError(t, err, "closing the HTTP request body must not close the storage")
	replay, err := io.ReadAll(replayBody)
	require.NoError(t, err)
	require.NoError(t, replayBody.Close())
	assert.Equal(t, payload, replay)

	require.NoError(t, storage.Close())
	_, err = body.NewReader()
	require.ErrorIs(t, err, ErrStorageClosed)
}

func TestGetRequestBodyRecordsHowTheBodyWasRead(t *testing.T) {
	const payload = `{"model":"claude-sonnet-5-5","messages":[]}`
	tests := []struct {
		name          string
		body          io.Reader
		contentLength int64
		want          RequestBodyRead
	}{
		{
			name:          "complete body",
			body:          strings.NewReader(payload),
			contentLength: int64(len(payload)),
			want:          RequestBodyRead{ContentLength: int64(len(payload)), Bytes: int64(len(payload))},
		},
		{
			// The 2026-10-27 499s: the client declared a body and stopped sending part way.
			name:          "upload cut off before Content-Length",
			body:          io.MultiReader(strings.NewReader(payload[:20]), iotest.ErrReader(io.ErrUnexpectedEOF)),
			contentLength: 4096,
			want:          RequestBodyRead{ContentLength: 4096, Bytes: 20, Error: io.ErrUnexpectedEOF.Error()},
		},
		{
			name:          "chunked body without Content-Length",
			body:          strings.NewReader(payload),
			contentLength: -1,
			want:          RequestBodyRead{ContentLength: -1, Bytes: int64(len(payload))},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", test.body)
			c.Request.ContentLength = test.contentLength
			t.Cleanup(func() { CleanupBodyStorage(c) })

			_, firstErr := GetRequestBody(c)
			first, ok := GetRequestBodyRead(c)
			require.True(t, ok)
			assert.GreaterOrEqual(t, first.ReadMs, int64(0))
			first.ReadMs = 0
			assert.Equal(t, test.want, first)
			assert.Equal(t, test.want.Error != "", firstErr != nil)

			_, secondErr := GetRequestBody(c)
			assert.Equal(t, firstErr, secondErr)
			second, _ := GetRequestBodyRead(c)
			second.ReadMs = 0
			assert.Equal(t, first, second, "a cached second read keeps the first measurement")
		})
	}
}
