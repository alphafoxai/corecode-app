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
 * CoreCode fork: rebuilds a per-token charge from the fields the gateway logs,
 * so a customer can check each request against the listed prices.
 *
 * Mirrors calculateTextQuotaSummary in service/text_quota.go for per-token
 * pricing. Anthropic usage reports input without the cached part; OpenAI-shaped
 * usage counts cache reads and writes inside prompt_tokens, so they are taken
 * out of the base. The sum is multiplied by model and group ratio and rounded
 * half away from zero, with a floor of one unit.
 *
 * Per-call prices, dynamic (expression) pricing, tasks and audio are priced
 * differently and are not reconstructed.
 */
import type { UsageLog } from '../data/schema'
import type { LogOtherData } from '../types'
import { hasToolSurcharge } from './format'
import { isPerCallBilling } from './utils'

/** new-api's ratio unit: a ratio of 1 is $2 per million tokens. */
const USD_PER_MILLION_AT_RATIO_ONE = 2

/** Rounding can move the logged charge by one quota unit at most. */
const MATCH_TOLERANCE = 1

export type CostLineKind =
  | 'input'
  | 'cache-read'
  | 'cache-write'
  | 'cache-write-5m'
  | 'cache-write-1h'
  | 'output'

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

export interface CostLine {
  kind: CostLineKind
  tokens: number
  /** USD per million tokens after the group ratio. */
  unitPriceUSD: number
  /** Quota units, unrounded. */
  subtotal: number
}

export interface CostCheck {
  lines: CostLine[]
  groupRatio: number
  /** What the listed prices give for this usage, in quota units. */
  expected: number
  actual: number
  /**
   * `match` when the logged charge equals the rebuilt one; `adjusted` when
   * something the log does not itemise (a tool surcharge, a multiplier) moved
   * it.
   */
  status: 'match' | 'adjusted'
}

function isAnthropicUsage(other: LogOtherData): boolean {
  return other.claude === true || other.usage_semantic === 'anthropic'
}

/**
 * Cache reads and all input tokens of one request. Anthropic input excludes
 * the cache, so it is added back; OpenAI-shaped input already contains it.
 */
export function getInputCacheTokens(
  log: Pick<UsageLog, 'prompt_tokens'>,
  other: LogOtherData | null
): { cacheRead: number; totalInput: number } {
  const prompt = log.prompt_tokens || 0
  if (!other) return { cacheRead: 0, totalInput: prompt }
  const cacheRead = other.cache_tokens || 0
  const split =
    (other.cache_creation_tokens_5m || 0) +
    (other.cache_creation_tokens_1h || 0)
  const cacheWrite = split > 0 ? split : other.cache_creation_tokens || 0
  const totalInput = isAnthropicUsage(other)
    ? prompt + cacheRead + cacheWrite
    : Math.max(prompt, cacheRead + cacheWrite)
  return { cacheRead, totalInput }
}

export function buildCostCheck(
  log: UsageLog,
  other: LogOtherData | null
): CostCheck | null {
  if (!other || log.type !== 2) return null
  if (isPerCallBilling(other.model_price)) return null
  if (other.billing_mode === 'tiered_expr' || other.is_task) return null
  if (other.audio || other.ws || other.image) return null

  const modelRatio = other.model_ratio
  const groupRatio = other.group_ratio
  if (modelRatio == null || groupRatio == null) return null
  if (!(modelRatio > 0) || !(groupRatio > 0)) return null

  const completionRatio = other.completion_ratio ?? 1
  const cacheRatio = other.cache_ratio ?? 1
  const cacheWriteRatio = other.cache_creation_ratio ?? 1
  const prompt = log.prompt_tokens || 0
  const completion = log.completion_tokens || 0
  const cacheRead = other.cache_tokens || 0
  const cacheWrite = other.cache_creation_tokens || 0
  const cacheWrite5m = other.cache_creation_tokens_5m || 0
  const cacheWrite1h = other.cache_creation_tokens_1h || 0
  const anthropic = isAnthropicUsage(other)

  // [kind, tokens, ratio relative to the model's input price]
  const parts: Array<[CostLineKind, number, number]> = []
  if (anthropic) {
    parts.push(['input', prompt, 1])
    parts.push(['cache-read', cacheRead, cacheRatio])
    const unsplit = Math.max(cacheWrite - cacheWrite5m - cacheWrite1h, 0)
    parts.push(['cache-write', unsplit, cacheWriteRatio])
    parts.push([
      'cache-write-5m',
      cacheWrite5m,
      other.cache_creation_ratio_5m ?? 0,
    ])
    parts.push([
      'cache-write-1h',
      cacheWrite1h,
      other.cache_creation_ratio_1h ?? 0,
    ])
  } else {
    const base = Math.max(prompt - cacheRead - cacheWrite, 0)
    parts.push(['input', base, 1])
    parts.push(['cache-read', cacheRead, cacheRatio])
    parts.push(['cache-write', cacheWrite, cacheWriteRatio])
  }
  parts.push(['output', completion, completionRatio])

  const lines: CostLine[] = parts
    .filter(
      ([kind, tokens]) => tokens > 0 || kind === 'input' || kind === 'output'
    )
    .map(([kind, tokens, kindRatio]) => ({
      kind,
      tokens,
      unitPriceUSD:
        kindRatio * modelRatio * groupRatio * USD_PER_MILLION_AT_RATIO_ONE,
      subtotal: tokens * kindRatio * modelRatio * groupRatio,
    }))

  const sum = lines.reduce((total, line) => total + line.subtotal, 0)
  const hasUsage = prompt + completion + cacheRead + cacheWrite > 0
  const expected = hasUsage ? Math.max(1, Math.round(sum)) : 0
  const actual = log.quota || 0
  const within = Math.abs(expected - actual) <= MATCH_TOLERANCE

  return {
    lines,
    groupRatio,
    expected,
    actual,
    status: within && !hasToolSurcharge(other) ? 'match' : 'adjusted',
  }
}
