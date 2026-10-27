package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// A proof-of-work challenge guards the anonymous account routes without a
// third-party service. The server picks a secret number n in [0, maxnumber]
// and publishes sha256(salt + n); the browser finds n by trying every value.
// Verification is stateless: an HMAC over salt and challenge proves the server
// issued them, and the salt carries the expiry. A solution passes once.

const (
	PowAlgorithm    = "SHA-256"
	PowChallengeTTL = 10 * time.Minute
	PowMinMaxNumber = 1000
	PowMaxMaxNumber = 10_000_000
	// A solution is a few hundred bytes of base64 JSON; anything longer is not one.
	powSolutionMaxLength = 1024
	powUsedKeyPrefix     = "pow:used:"
)

var (
	ErrPowSolutionInvalid = errors.New("proof-of-work solution is invalid")
	ErrPowSolutionExpired = errors.New("proof-of-work solution has expired")
	ErrPowSolutionUsed    = errors.New("proof-of-work solution was already used")
)

type PowChallenge struct {
	Algorithm string `json:"algorithm"`
	Salt      string `json:"salt"`
	Challenge string `json:"challenge"`
	MaxNumber int    `json:"maxnumber"`
	Signature string `json:"signature"`
	ExpiresAt int64  `json:"expires_at"`
}

// powSolution is what the browser returns: the challenge it was given and the
// number it found, as base64 JSON in the X-Pow-Solution header.
type powSolution struct {
	Salt      string `json:"salt"`
	Challenge string `json:"challenge"`
	Number    int    `json:"number"`
	Signature string `json:"signature"`
}

// powSigningKey is derived from CRYPTO_SECRET, which every server color
// shares, so a challenge issued by one color verifies on the other and no
// separate secret has to be provisioned.
func powSigningKey() []byte {
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	mac.Write([]byte("corecode/pow-challenge/v1"))
	return mac.Sum(nil)
}

func powSignature(salt, challenge string) string {
	return common.GenerateHMACWithKey(powSigningKey(), salt+"\n"+challenge)
}

func powHash(salt string, number int) string {
	sum := sha256.Sum256([]byte(salt + strconv.Itoa(number)))
	return hex.EncodeToString(sum[:])
}

func NewPowChallenge(now time.Time, maxNumber int) (PowChallenge, error) {
	maxNumber = min(max(maxNumber, PowMinMaxNumber), PowMaxMaxNumber)
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return PowChallenge{}, err
	}
	number, err := rand.Int(rand.Reader, big.NewInt(int64(maxNumber)+1))
	if err != nil {
		return PowChallenge{}, err
	}
	expiresAt := now.Add(PowChallengeTTL).Unix()
	salt := hex.EncodeToString(random) + "." + strconv.FormatInt(expiresAt, 10)
	challenge := powHash(salt, int(number.Int64()))
	return PowChallenge{
		Algorithm: PowAlgorithm,
		Salt:      salt,
		Challenge: challenge,
		MaxNumber: maxNumber,
		Signature: powSignature(salt, challenge),
		ExpiresAt: expiresAt,
	}, nil
}

// VerifyPowSolution checks a solution without consuming it and returns the
// signature, which identifies the challenge for single use, and its expiry.
func VerifyPowSolution(raw string, now time.Time) (string, time.Time, error) {
	if raw == "" || len(raw) > powSolutionMaxLength {
		return "", time.Time{}, ErrPowSolutionInvalid
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return "", time.Time{}, ErrPowSolutionInvalid
	}
	var solution powSolution
	if err := common.Unmarshal(decoded, &solution); err != nil {
		return "", time.Time{}, ErrPowSolutionInvalid
	}
	_, expiresText, found := strings.Cut(solution.Salt, ".")
	expiresUnix, err := strconv.ParseInt(expiresText, 10, 64)
	if !found || err != nil {
		return "", time.Time{}, ErrPowSolutionInvalid
	}
	if !hmac.Equal([]byte(powSignature(solution.Salt, solution.Challenge)), []byte(solution.Signature)) {
		return "", time.Time{}, ErrPowSolutionInvalid
	}
	if solution.Number < 0 || powHash(solution.Salt, solution.Number) != solution.Challenge {
		return "", time.Time{}, ErrPowSolutionInvalid
	}
	expiresAt := time.Unix(expiresUnix, 0)
	if !now.Before(expiresAt) {
		return "", time.Time{}, ErrPowSolutionExpired
	}
	return solution.Signature, expiresAt, nil
}

// ConsumePowSolution verifies a solution and marks it used until it expires.
// With Redis the mark is shared by both server colors during a release;
// without Redis there is one process, so memory is enough. A Redis error
// refuses the request rather than letting a solution be replayed.
func ConsumePowSolution(ctx context.Context, raw string, now time.Time) error {
	signature, expiresAt, err := VerifyPowSolution(raw, now)
	if err != nil {
		return err
	}
	ttl := max(expiresAt.Sub(now), time.Second)
	if common.RedisEnabled {
		fresh, err := common.RDB.SetNX(ctx, powUsedKeyPrefix+signature, 1, ttl).Result()
		if err != nil {
			return err
		}
		if !fresh {
			return ErrPowSolutionUsed
		}
		return nil
	}
	if !powUsedInMemory.consume(signature, expiresAt, now) {
		return ErrPowSolutionUsed
	}
	return nil
}

type powUsedSet struct {
	mu    sync.Mutex
	until map[string]time.Time
}

var powUsedInMemory = &powUsedSet{until: map[string]time.Time{}}

func (s *powUsedSet) consume(signature string, expiresAt, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, until := range s.until {
		if !until.After(now) {
			delete(s.until, key)
		}
	}
	if _, used := s.until[signature]; used {
		return false
	}
	s.until[signature] = expiresAt
	return true
}
