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
/**
 * CoreCode fork: figures the customer overview derives from their own
 * request logs and hourly quota rows.
 */
import type { QuotaDataItem } from '@/features/dashboard/types'
import type { UsageLog } from '@/features/usage-logs/data/schema'

const LOG_TYPE_CONSUME = 2

interface LogUsageFields {
  cache_tokens?: number
  cache_creation_tokens?: number
  cache_creation_tokens_5m?: number
  cache_creation_tokens_1h?: number
  claude?: boolean
  usage_semantic?: string
  frt?: number
}

function parseUsageFields(other: string): LogUsageFields {
  if (!other) return {}
  try {
    return JSON.parse(other) as LogUsageFields
  } catch {
    return {}
  }
}

export interface RecentUsageSummary {
  requests: number
  /** Cache reads over all input tokens, 0–1; null without any input. */
  cacheHitRate: number | null
  /** Mean time to first token in milliseconds; null when none recorded. */
  avgFirstTokenMs: number | null
}

/**
 * Anthropic usage reports input_tokens without the cached part, so total
 * input is input + cache read + cache write. OpenAI-shaped usage already
 * counts cached tokens inside prompt_tokens.
 */
export function summarizeRecentLogs(logs: UsageLog[]): RecentUsageSummary {
  let requests = 0
  let cacheRead = 0
  let totalInput = 0
  let firstTokenTotal = 0
  let firstTokenCount = 0

  for (const log of logs) {
    if (log.type !== LOG_TYPE_CONSUME) continue
    requests++
    const usage = parseUsageFields(log.other)
    const read = usage.cache_tokens ?? 0
    const splitWrite =
      (usage.cache_creation_tokens_5m ?? 0) +
      (usage.cache_creation_tokens_1h ?? 0)
    const write = splitWrite > 0 ? splitWrite : (usage.cache_creation_tokens ?? 0)
    const prompt = log.prompt_tokens ?? 0
    const anthropic = usage.claude === true || usage.usage_semantic === 'anthropic'

    cacheRead += read
    totalInput += anthropic ? prompt + read + write : Math.max(prompt, read + write)

    if (usage.frt && usage.frt > 0) {
      firstTokenTotal += usage.frt
      firstTokenCount++
    }
  }

  return {
    requests,
    cacheHitRate: totalInput > 0 ? cacheRead / totalInput : null,
    avgFirstTokenMs:
      firstTokenCount > 0 ? firstTokenTotal / firstTokenCount : null,
  }
}

export type CacheGrade = 'good' | 'fair' | 'poor'

/**
 * A Claude Code session that stays on one account re-reads most of its
 * context from cache, so a healthy session sits well above 80%.
 */
export function getCacheGrade(hitRate: number): CacheGrade {
  if (hitRate >= 0.8) return 'good'
  if (hitRate >= 0.5) return 'fair'
  return 'poor'
}

export interface DailySpend {
  /** Unix seconds at the start of the local day. */
  day: number
  quota: number
  requests: number
}

function startOfLocalDay(unixSeconds: number): number {
  const date = new Date(unixSeconds * 1000)
  date.setHours(0, 0, 0, 0)
  return Math.floor(date.getTime() / 1000)
}

/**
 * Buckets hourly quota rows into `days` local days ending today, oldest
 * first, with empty days kept so the chart keeps its time axis.
 */
export function bucketDailySpend(
  rows: QuotaDataItem[],
  days: number,
  nowSeconds: number
): DailySpend[] {
  const today = startOfLocalDay(nowSeconds)
  const buckets: DailySpend[] = []
  const index = new Map<number, DailySpend>()
  for (let offset = days - 1; offset >= 0; offset--) {
    // Step back by calendar day, not 86400 s, so DST changes stay aligned.
    const date = new Date(today * 1000)
    date.setDate(date.getDate() - offset)
    const day = Math.floor(date.getTime() / 1000)
    const bucket = { day, quota: 0, requests: 0 }
    buckets.push(bucket)
    index.set(day, bucket)
  }

  for (const row of rows) {
    const bucket = index.get(startOfLocalDay(Number(row.created_at) || 0))
    if (!bucket) continue
    bucket.quota += Number(row.quota) || 0
    bucket.requests += Number(row.count) || 0
  }
  return buckets
}

/**
 * Days the balance lasts at the average daily spend of the days that had
 * any spend. Null when there is nothing to project from.
 */
export function estimateRunwayDays(
  balance: number,
  daily: DailySpend[]
): number | null {
  const active = daily.filter((item) => item.quota > 0)
  if (balance <= 0 || active.length === 0) return null
  const average = active.reduce((sum, item) => sum + item.quota, 0) / active.length
  return average > 0 ? balance / average : null
}

