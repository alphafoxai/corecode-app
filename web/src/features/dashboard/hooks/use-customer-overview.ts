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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getApiKeys } from '@/features/keys/api'
import { getUserLogs } from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { requireServerSuccess } from '@/lib/server-error-message'
import { getStartOfDay } from '@/lib/time'

import { getUserQuotaDates } from '../api'
import {
  bucketDailySpend,
  summarizeRecentLogs,
} from '../lib/customer-overview'

export const OVERVIEW_TREND_DAYS = 14
/** Requests the cache hit rate and first-token latency are averaged over. */
export const OVERVIEW_RECENT_LOGS = 100

const LOG_TYPE_CONSUME = 2

/**
 * Everything the customer overview reads, fetched once and shared by its
 * panels. Each query is scoped to the signed-in user's own data.
 */
export function useCustomerOverview() {
  // Fixed at mount so the query keys stay stable across renders.
  const range = useMemo(() => {
    const end = Math.floor(Date.now() / 1000)
    const start = getStartOfDay()
    start.setDate(start.getDate() - (OVERVIEW_TREND_DAYS - 1))
    return { start: Math.floor(start.getTime() / 1000), end }
  }, [])

  const trendQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'daily-spend', range.start],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: range.start,
          end_timestamp: range.end,
          default_time: 'hour',
        })
      ).data ?? [],
    staleTime: 60 * 1000,
  })

  const logsQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'recent-logs'],
    queryFn: async () => {
      const result = requireServerSuccess(
        await getUserLogs({
          p: 1,
          page_size: OVERVIEW_RECENT_LOGS,
          type: LOG_TYPE_CONSUME,
        })
      )
      return (result.data?.items ?? []) as UsageLog[]
    },
    staleTime: 30 * 1000,
  })

  const keysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys'],
    queryFn: async () =>
      requireServerSuccess(await getApiKeys({ p: 1, size: 50 })).data?.items ??
      [],
    staleTime: 60 * 1000,
  })

  const daily = useMemo(
    () =>
      bucketDailySpend(
        trendQuery.data ?? [],
        OVERVIEW_TREND_DAYS,
        range.end
      ),
    [range.end, trendQuery.data]
  )

  const recent = useMemo(
    () => summarizeRecentLogs(logsQuery.data ?? []),
    [logsQuery.data]
  )

  return {
    daily,
    trendLoading: trendQuery.isLoading,
    recent,
    recentLogs: logsQuery.data ?? [],
    logsLoading: logsQuery.isLoading,
    keys: keysQuery.data ?? [],
    keysLoading: keysQuery.isLoading,
  }
}
