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

// The browser half of the proof-of-work check (service/pow_challenge.go): the
// server publishes sha256(salt + n) for a secret n in [0, maxnumber], and the
// browser finds n by trying every value.

export const POW_SOLUTION_HEADER = 'X-Pow-Solution'

export interface PowChallenge {
  algorithm: string
  salt: string
  challenge: string
  maxnumber: number
  signature: string
  // Unix seconds; the server refuses the solution from then on.
  expires_at: number
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// Resolves to the X-Pow-Solution value. crypto.subtle hashes off the main
// thread, so the page stays responsive while the loop runs; signal stops it.
export async function solvePowChallenge(
  challenge: PowChallenge,
  signal?: AbortSignal
): Promise<string> {
  if (challenge.algorithm !== 'SHA-256') {
    throw new Error(
      `Unsupported proof-of-work algorithm: ${challenge.algorithm}`
    )
  }
  const encoder = new TextEncoder()
  const target = hexToBytes(challenge.challenge)
  for (let number = 0; number <= challenge.maxnumber; number++) {
    signal?.throwIfAborted()
    const digest = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(challenge.salt + number)
    )
    if (sameBytes(new Uint8Array(digest), target)) {
      return btoa(
        JSON.stringify({
          salt: challenge.salt,
          challenge: challenge.challenge,
          number,
          signature: challenge.signature,
        })
      )
    }
  }
  throw new Error('Proof-of-work challenge has no solution')
}

export function powSolutionHeaders(
  solution?: string
): Record<string, string> | undefined {
  return solution ? { [POW_SOLUTION_HEADER]: solution } : undefined
}
