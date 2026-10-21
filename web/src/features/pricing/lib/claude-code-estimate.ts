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
 * CoreCode fork: what a Claude Code workload costs on a model.
 *
 * Claude Code resends the whole conversation every turn and marks the newest
 * message as a cache breakpoint. The part of the context already cached is
 * billed as cache reads; the rest is new and is written to the cache, so it
 * is billed at the cache write price. Output is billed as output.
 */
import type { PricingModel } from '../types'
import { getTokenPricePerMillion } from './price'

export interface ClaudeCodeWorkload {
  /** Context tokens sent each turn. */
  contextTokens: number
  /** Share of the context read from cache, 0–1. */
  cacheHitRate: number
  /** Output tokens per turn. */
  outputTokens: number
  turnsPerDay: number
}

export interface ClaudeCodeEstimate {
  /** USD per turn. */
  perTurn: number
  perDay: number
  /** The same workload with every context token billed as plain input. */
  perDayWithoutCache: number
}

export const DEFAULT_WORKLOAD: ClaudeCodeWorkload = {
  contextTokens: 60_000,
  cacheHitRate: 0.9,
  outputTokens: 1_500,
  turnsPerDay: 200,
}

const MILLION = 1_000_000

export function estimateClaudeCodeCost(
  model: PricingModel,
  workload: ClaudeCodeWorkload,
  selectedGroup?: string
): ClaudeCodeEstimate | null {
  const input = getTokenPricePerMillion(model, 'input', selectedGroup)
  const output = getTokenPricePerMillion(model, 'output', selectedGroup)
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null

  // A model without cache prices bills the whole context as input.
  const cacheRead = getTokenPricePerMillion(model, 'cache', selectedGroup)
  const cacheWrite = getTokenPricePerMillion(
    model,
    'create_cache',
    selectedGroup
  )
  const hitRate = Math.min(Math.max(workload.cacheHitRate, 0), 1)
  const hit = workload.contextTokens * hitRate
  const miss = workload.contextTokens - hit

  const contextCost =
    hit * (Number.isFinite(cacheRead) ? cacheRead : input) +
    miss * (Number.isFinite(cacheWrite) ? cacheWrite : input)
  const outputCost = workload.outputTokens * output
  const perTurn = (contextCost + outputCost) / MILLION
  const perTurnWithoutCache =
    (workload.contextTokens * input + outputCost) / MILLION

  return {
    perTurn,
    perDay: perTurn * workload.turnsPerDay,
    perDayWithoutCache: perTurnWithoutCache * workload.turnsPerDay,
  }
}
