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
import type { QuotaDataItem } from '@/features/dashboard/types'

/**
 * Safe division: handles NaN and Infinity cases
 */
export function safeDivide(
  value: number,
  divisor: number,
  precision: number = 3
): number {
  const result = value / divisor
  if (isNaN(result) || !isFinite(result)) return 0
  const factor = Math.pow(10, precision)
  return Math.round(result * factor) / factor
}

/**
 * Calculate aggregated statistics from quota data.
 *
 * totalTokens is every token processed: input, output, cache reads and cache
 * writes. token_used is input plus output, and every upstream here is Claude
 * Messages, whose input excludes the cache, so the cache counts are added
 * rather than already inside it.
 */
export function calculateDashboardStats(data: QuotaDataItem[]) {
  return data.reduce(
    (acc, item) => {
      const cacheRead = Number.isFinite(item.cache_read_tokens)
        ? Math.max(0, item.cache_read_tokens ?? 0)
        : 0
      const cacheCreation = Number.isFinite(item.cache_creation_tokens)
        ? Math.max(0, item.cache_creation_tokens ?? 0)
        : 0
      return {
        totalQuota: acc.totalQuota + (Number(item.quota) || 0),
        totalCount: acc.totalCount + (Number(item.count) || 0),
        totalTokens:
          acc.totalTokens +
          (Number(item.token_used) || 0) +
          cacheRead +
          cacheCreation,
        totalCacheReadTokens: acc.totalCacheReadTokens + cacheRead,
        totalCacheCreationTokens: acc.totalCacheCreationTokens + cacheCreation,
      }
    },
    {
      totalQuota: 0,
      totalCount: 0,
      totalTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    }
  )
}
