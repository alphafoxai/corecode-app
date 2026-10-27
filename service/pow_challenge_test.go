package service

import (
	"context"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var powTestNow = time.Unix(1_800_000_000, 0)

// solvePow is the browser's side: try every number up to maxnumber.
func solvePow(t *testing.T, challenge PowChallenge) powSolution {
	t.Helper()
	for number := 0; number <= challenge.MaxNumber; number++ {
		if powHash(challenge.Salt, number) == challenge.Challenge {
			return powSolution{Salt: challenge.Salt, Challenge: challenge.Challenge, Number: number, Signature: challenge.Signature}
		}
	}
	t.Fatalf("challenge has no solution up to %d", challenge.MaxNumber)
	return powSolution{}
}

func encodePow(t *testing.T, solution powSolution) string {
	t.Helper()
	data, err := common.Marshal(solution)
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(data)
}

func newSolvedPow(t *testing.T) (PowChallenge, powSolution) {
	t.Helper()
	challenge, err := NewPowChallenge(powTestNow, PowMinMaxNumber)
	require.NoError(t, err)
	return challenge, solvePow(t, challenge)
}

func TestNewPowChallengeKeepsTheSearchSpaceInBounds(t *testing.T) {
	low, err := NewPowChallenge(powTestNow, 1)
	require.NoError(t, err)
	assert.Equal(t, PowMinMaxNumber, low.MaxNumber)
	high, err := NewPowChallenge(powTestNow, PowMaxMaxNumber*10)
	require.NoError(t, err)
	assert.Equal(t, PowMaxMaxNumber, high.MaxNumber)
	assert.Equal(t, PowAlgorithm, low.Algorithm)
	assert.Equal(t, powTestNow.Add(PowChallengeTTL).Unix(), low.ExpiresAt)
}

func TestVerifyPowSolutionAcceptsOnlyTheIssuedAnswer(t *testing.T) {
	challenge, solution := newSolvedPow(t)

	signature, expiresAt, err := VerifyPowSolution(encodePow(t, solution), powTestNow)
	require.NoError(t, err)
	assert.Equal(t, challenge.Signature, signature)
	assert.Equal(t, challenge.ExpiresAt, expiresAt.Unix())

	wrongNumber := solution
	wrongNumber.Number = (solution.Number + 1) % (challenge.MaxNumber + 1)
	_, _, err = VerifyPowSolution(encodePow(t, wrongNumber), powTestNow)
	assert.ErrorIs(t, err, ErrPowSolutionInvalid)

	negative := solution
	negative.Number = -1
	_, _, err = VerifyPowSolution(encodePow(t, negative), powTestNow)
	assert.ErrorIs(t, err, ErrPowSolutionInvalid)

	forged := solution
	forged.Signature = strings.Repeat("0", len(solution.Signature))
	_, _, err = VerifyPowSolution(encodePow(t, forged), powTestNow)
	assert.ErrorIs(t, err, ErrPowSolutionInvalid)
}

// A client cannot mint its own challenge, or extend one, because the salt
// and the challenge are both under the server's HMAC.
func TestVerifyPowSolutionRejectsSelfMadeOrExtendedChallenges(t *testing.T) {
	_, solution := newSolvedPow(t)

	extended := solution
	random, _, _ := strings.Cut(solution.Salt, ".")
	extended.Salt = random + ".9999999999"
	extended.Challenge = powHash(extended.Salt, 0)
	extended.Number = 0
	_, _, err := VerifyPowSolution(encodePow(t, extended), powTestNow)
	assert.ErrorIs(t, err, ErrPowSolutionInvalid)

	secret := common.CryptoSecret
	common.CryptoSecret = "another-deployment"
	_, _, err = VerifyPowSolution(encodePow(t, solution), powTestNow)
	common.CryptoSecret = secret
	assert.ErrorIs(t, err, ErrPowSolutionInvalid)
}

func TestVerifyPowSolutionExpires(t *testing.T) {
	_, solution := newSolvedPow(t)
	raw := encodePow(t, solution)

	_, _, err := VerifyPowSolution(raw, powTestNow.Add(PowChallengeTTL-time.Second))
	assert.NoError(t, err)
	_, _, err = VerifyPowSolution(raw, powTestNow.Add(PowChallengeTTL))
	assert.ErrorIs(t, err, ErrPowSolutionExpired)
}

func TestVerifyPowSolutionRejectsMalformedInput(t *testing.T) {
	for name, raw := range map[string]string{
		"empty":        "",
		"not base64":   "%%%",
		"not json":     base64.StdEncoding.EncodeToString([]byte("nope")),
		"no expiry":    base64.StdEncoding.EncodeToString([]byte(`{"salt":"abc","challenge":"x","number":1,"signature":"y"}`)),
		"too long":     strings.Repeat("A", powSolutionMaxLength+4),
		"empty object": base64.StdEncoding.EncodeToString([]byte(`{}`)),
	} {
		t.Run(name, func(t *testing.T) {
			_, _, err := VerifyPowSolution(raw, powTestNow)
			assert.ErrorIs(t, err, ErrPowSolutionInvalid)
		})
	}
}

func TestConsumePowSolutionPassesOncePerProcess(t *testing.T) {
	previous := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = previous })

	_, solution := newSolvedPow(t)
	raw := encodePow(t, solution)
	require.NoError(t, ConsumePowSolution(context.Background(), raw, powTestNow))
	assert.ErrorIs(t, ConsumePowSolution(context.Background(), raw, powTestNow), ErrPowSolutionUsed)

	_, other := newSolvedPow(t)
	assert.NoError(t, ConsumePowSolution(context.Background(), encodePow(t, other), powTestNow))
}

// Both server colors share Redis during a release, so a solution spent on one
// is refused by the other.
func TestConsumePowSolutionPassesOnceAcrossInstancesWithRedis(t *testing.T) {
	previousEnabled, previousClient := common.RedisEnabled, common.RDB
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	common.RedisEnabled, common.RDB = true, client
	t.Cleanup(func() {
		_ = client.Close()
		common.RedisEnabled, common.RDB = previousEnabled, previousClient
	})

	challenge, solution := newSolvedPow(t)
	raw := encodePow(t, solution)
	require.NoError(t, ConsumePowSolution(context.Background(), raw, powTestNow))
	assert.ErrorIs(t, ConsumePowSolution(context.Background(), raw, powTestNow), ErrPowSolutionUsed)

	ttl := server.TTL(powUsedKeyPrefix + challenge.Signature)
	assert.Equal(t, PowChallengeTTL, ttl)

	server.Close()
	_, other := newSolvedPow(t)
	err := ConsumePowSolution(context.Background(), encodePow(t, other), powTestNow)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, ErrPowSolutionUsed)
}
