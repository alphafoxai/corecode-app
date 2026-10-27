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

import type { QuotaDataItem } from '@/features/dashboard/types'

import { calculateDashboardStats } from '../stats'

describe('calculateDashboardStats', () => {
  test('counts cache reads and writes in the total tokens', () => {
    const data: QuotaDataItem[] = [
      {
        created_at: 0,
        count: 1,
        quota: 100,
        token_used: 435,
        cache_read_tokens: 413_321,
        cache_creation_tokens: 1_807,
      },
      { created_at: 3600, count: 2, quota: 50, token_used: 20 },
    ]

    expect(calculateDashboardStats(data)).toEqual({
      totalQuota: 150,
      totalCount: 3,
      totalTokens: 415_583,
      totalCacheReadTokens: 413_321,
      totalCacheCreationTokens: 1_807,
    })
  })

  test('ignores cache counts that are not finite or are negative', () => {
    const data: QuotaDataItem[] = [
      {
        created_at: 0,
        token_used: 10,
        cache_read_tokens: Number.NaN,
        cache_creation_tokens: -5,
      },
    ]

    const stats = calculateDashboardStats(data)
    expect(stats.totalTokens).toBe(10)
    expect(stats.totalCacheReadTokens).toBe(0)
    expect(stats.totalCacheCreationTokens).toBe(0)
  })
})
