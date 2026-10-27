/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { type PowChallenge, solvePowChallenge } from '../proof-of-work'

// The server's side (service/pow_challenge.go): publish sha256(salt + n).
function challengeFor(number: number, maxnumber = 1000): PowChallenge {
  const salt = `0123456789abcdef0123456789abcdef.${1_800_000_000}`
  return {
    algorithm: 'SHA-256',
    salt,
    challenge: createHash('sha256').update(`${salt}${number}`).digest('hex'),
    maxnumber,
    signature: 'server-signature',
    expires_at: 1_800_000_000,
  }
}

describe('solvePowChallenge', () => {
  it('finds the number and returns the challenge with it as base64 JSON', async () => {
    const challenge = challengeFor(777)
    const solution = JSON.parse(atob(await solvePowChallenge(challenge)))
    expect(solution).toEqual({
      salt: challenge.salt,
      challenge: challenge.challenge,
      number: 777,
      signature: 'server-signature',
    })
  })

  it('fails when the number is outside the search space', async () => {
    await expect(solvePowChallenge(challengeFor(50, 10))).rejects.toThrow(
      'no solution'
    )
  })

  it('stops when the form goes away', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(
      solvePowChallenge(challengeFor(777), abort.signal)
    ).rejects.toThrow()
  })

  it('refuses an algorithm it does not implement', async () => {
    await expect(
      solvePowChallenge({ ...challengeFor(1), algorithm: 'SHA-512' })
    ).rejects.toThrow('Unsupported')
  })
})
