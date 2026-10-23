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
 * CoreCode fork: the cache hit rate per time bucket and per model, from the
 * hourly quota rows the model analytics page already loads.
 */
import type { QuotaDataItem } from '@/features/dashboard/types'
import type { TimeGranularity } from '@/lib/time'

export const ALL_MODELS = '__all__'

export interface CacheUsage {
  readTokens: number
  writeTokens: number
}

export interface CacheUsageByModel extends CacheUsage {
  byModel: Map<string, CacheUsage>
}

export interface CacheBucket extends CacheUsageByModel {
  /** Unix seconds at the start of the local hour, day or week. */
  start: number
}

export interface CacheHitRateSummary extends CacheUsageByModel {
  buckets: CacheBucket[]
  /** Models that recorded cache use, most cached tokens first. */
  models: string[]
}

/**
 * Cache reads over cache reads plus writes. Claude Code sends almost no
 * uncached input, so this tracks the request-level hit rate. Null when
 * nothing was cached, including rows from before quota_data recorded cache
 * tokens.
 */
export function getCacheHitRate(usage: CacheUsage): number | null {
  const total = usage.readTokens + usage.writeTokens
  return total > 0 ? usage.readTokens / total : null
}

/** Start of the local hour, day or Monday-based week holding `seconds`. */
export function getBucketStart(
  seconds: number,
  granularity: TimeGranularity
): number {
  const date = new Date(seconds * 1000)
  date.setMinutes(0, 0, 0)
  if (granularity !== 'hour') date.setHours(0)
  if (granularity === 'week') {
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  }
  return Math.floor(date.getTime() / 1000)
}

function nextBucketStart(start: number, granularity: TimeGranularity): number {
  const date = new Date(start * 1000)
  // Step by calendar units, not fixed seconds, so DST changes stay aligned.
  if (granularity === 'hour') date.setHours(date.getHours() + 1)
  if (granularity === 'day') date.setDate(date.getDate() + 1)
  if (granularity === 'week') date.setDate(date.getDate() + 7)
  return Math.floor(date.getTime() / 1000)
}

/**
 * Buckets quota rows over [rangeStart, rangeEnd), keeping empty buckets so
 * the chart keeps its time axis. A row outside the range is ignored.
 */
export function summarizeCacheHitRate(
  rows: QuotaDataItem[],
  range: { start: number; end: number },
  granularity: TimeGranularity
): CacheHitRateSummary {
  const buckets: CacheBucket[] = []
  const bucketIndex = new Map<number, CacheBucket>()
  for (
    let start = getBucketStart(range.start, granularity);
    start < range.end;
    start = nextBucketStart(start, granularity)
  ) {
    const bucket = { start, readTokens: 0, writeTokens: 0, byModel: new Map() }
    buckets.push(bucket)
    bucketIndex.set(start, bucket)
  }

  const byModel = new Map<string, CacheUsage>()
  let readTokens = 0
  let writeTokens = 0
  for (const row of rows) {
    const read = Number(row.cache_read_tokens) || 0
    const write = Number(row.cache_creation_tokens) || 0
    if (read + write === 0) continue
    const bucket = bucketIndex.get(getBucketStart(row.created_at, granularity))
    if (!bucket) continue

    const model = row.model_name || 'Unknown'
    bucket.readTokens += read
    bucket.writeTokens += write
    for (const usageByModel of [bucket.byModel, byModel]) {
      const usage = usageByModel.get(model) ?? { readTokens: 0, writeTokens: 0 }
      usage.readTokens += read
      usage.writeTokens += write
      usageByModel.set(model, usage)
    }
    readTokens += read
    writeTokens += write
  }

  const cachedTokens = (model: string) => {
    const usage = byModel.get(model)
    return usage ? usage.readTokens + usage.writeTokens : 0
  }
  const models = [...byModel.keys()].sort(
    (a, b) => cachedTokens(b) - cachedTokens(a)
  )
  return { buckets, models, byModel, readTokens, writeTokens }
}

/** Cache use of one series: every model together, or a single model. */
export function getSeriesUsage(
  source: CacheUsageByModel,
  series: string
): CacheUsage {
  if (series === ALL_MODELS) return source
  return source.byModel.get(series) ?? { readTokens: 0, writeTokens: 0 }
}

/** What one cached token is worth for a model, in quota units. */
export interface CachePrice {
  /** Quota for one uncached input token, group ratio included. */
  inputQuota: number
  readRatio: number
  writeRatio: number
}

/** Fields of a `/api/pricing` model the savings estimate reads. */
export interface CachePricingModel {
  model_name: string
  quota_type: number
  model_ratio: number
  cache_ratio?: number | null
  create_cache_ratio?: number | null
  enable_groups: string[]
  billing_mode?: string
}

// The backend's DefaultCacheRatio and DefaultCreateCacheRatio.
const DEFAULT_CACHE_READ_RATIO = 1
const DEFAULT_CACHE_WRITE_RATIO = 1.25

/**
 * Prices for models billed per token at a fixed ratio. A model's group ratio
 * is that of the first auto group serving it, which is where the default
 * `auto` key routes; failing that, the cheapest group serving it. Per-call
 * and tiered models are left out because a token count does not price them.
 */
export function buildCachePrices(
  models: CachePricingModel[],
  groupRatio: Record<string, number>,
  autoGroups: string[]
): Map<string, CachePrice> {
  const prices = new Map<string, CachePrice>()
  for (const model of models) {
    if (model.quota_type !== 0 || model.billing_mode === 'tiered_expr') continue
    const groups = model.enable_groups.filter((group) => group in groupRatio)
    const autoGroup = autoGroups.find((group) => groups.includes(group))
    let ratio = 1
    if (autoGroup) {
      ratio = groupRatio[autoGroup]
    } else if (groups.length > 0) {
      ratio = Math.min(...groups.map((group) => groupRatio[group]))
    }
    prices.set(model.model_name, {
      inputQuota: model.model_ratio * ratio,
      readRatio: model.cache_ratio ?? DEFAULT_CACHE_READ_RATIO,
      writeRatio: model.create_cache_ratio ?? DEFAULT_CACHE_WRITE_RATIO,
    })
  }
  return prices
}

export interface CacheSavings {
  /** What cache reads saved against paying full input price, in quota. */
  saved: number
  /** What cache writes cost above full input price, in quota. */
  writePremium: number
  /** False when some model with cache use has no price to estimate with. */
  complete: boolean
}

/**
 * Estimated savings of one series. quota_data does not split 5-minute from
 * 1-hour cache writes, so every write is priced at the model's write ratio.
 */
export function estimateCacheSavings(
  source: CacheUsageByModel,
  series: string,
  prices: Map<string, CachePrice>
): CacheSavings {
  const savings = { saved: 0, writePremium: 0, complete: true }
  for (const [model, usage] of source.byModel) {
    if (series !== ALL_MODELS && model !== series) continue
    const price = prices.get(model)
    if (!price) {
      savings.complete = false
      continue
    }
    savings.saved += usage.readTokens * price.inputQuota * (1 - price.readRatio)
    savings.writePremium +=
      usage.writeTokens * price.inputQuota * (price.writeRatio - 1)
  }
  return savings
}
