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
import { describe, expect, test } from 'vitest'

import type { UserConcurrency } from '../types'
import { concurrencyAfterPaying, nextConcurrencyTier } from './concurrency'

const base: UserConcurrency = {
  limit: 5,
  source: 'group',
  group_limit: 5,
  paid_total: 300,
  tiers: [
    { min_paid: 2000, limit: 20 },
    { min_paid: 1000, limit: 10 },
  ],
}

describe('concurrency tiers', () => {
  test('a payment that crosses a tier raises the limit', () => {
    expect(concurrencyAfterPaying(base, 699)).toBeNull()
    expect(concurrencyAfterPaying(base, 700)).toBe(10)
    expect(concurrencyAfterPaying(base, 1700)).toBe(20)
  })

  test('the next tier says what is left to pay', () => {
    expect(nextConcurrencyTier(base)).toEqual({
      min_paid: 1000,
      limit: 10,
      remaining: 700,
    })
    expect(
      nextConcurrencyTier({
        ...base,
        limit: 10,
        source: 'tier',
        paid_total: 1200,
      })
    ).toEqual({ min_paid: 2000, limit: 20, remaining: 800 })
    expect(
      nextConcurrencyTier({
        ...base,
        limit: 20,
        source: 'tier',
        paid_total: 2500,
      })
    ).toBeNull()
  })

  test('an operator limit or an unlimited account has nothing to buy', () => {
    expect(nextConcurrencyTier({ ...base, source: 'user' })).toBeNull()
    expect(concurrencyAfterPaying({ ...base, limit: 0 }, 5000)).toBeNull()
  })
})
