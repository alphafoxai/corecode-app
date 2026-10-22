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

import type { PricingModel } from '../../types'
import {
  DEFAULT_WORKLOAD,
  estimateClaudeCodeCost,
} from '../claude-code-estimate'

// claude-sonnet-5-5 on production: $3 input, $15 output, $0.15 cache read,
// $3.75 cache write per million after its 1.5× group.
const sonnet: PricingModel = {
  id: 1,
  model_name: 'claude-sonnet-5-5',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 5,
  cache_ratio: 0.05,
  create_cache_ratio: 1.25,
  enable_groups: ['default'],
  group_ratio: { default: 1.5 },
}

describe('estimateClaudeCodeCost', () => {
  test('bills cached context as reads and the rest as cache writes', () => {
    const estimate = estimateClaudeCodeCost(sonnet, DEFAULT_WORKLOAD)

    // 54k × 0.15 + 6k × 3.75 + 1.5k × 15 = 53,100 USD per million tokens
    expect(estimate?.perTurn).toBeCloseTo(0.0531, 6)
    expect(estimate?.perDay).toBeCloseTo(10.62, 6)
  })

  test('compares against billing the whole context as plain input', () => {
    const estimate = estimateClaudeCodeCost(sonnet, DEFAULT_WORKLOAD)

    // (60k × 3 + 1.5k × 15) × 200 turns
    expect(estimate?.perDayWithoutCache).toBeCloseTo(40.5, 6)
  })

  test('bills context as plain input when the model has no cache prices', () => {
    const plain = {
      ...sonnet,
      cache_ratio: undefined,
      create_cache_ratio: undefined,
    }
    const estimate = estimateClaudeCodeCost(plain, DEFAULT_WORKLOAD)

    expect(estimate?.perDay).toBeCloseTo(estimate?.perDayWithoutCache ?? -1, 6)
  })

  test('clamps the hit rate to the 0–1 range', () => {
    const all = estimateClaudeCodeCost(sonnet, {
      ...DEFAULT_WORKLOAD,
      cacheHitRate: 1,
    })
    const over = estimateClaudeCodeCost(sonnet, {
      ...DEFAULT_WORKLOAD,
      cacheHitRate: 1.4,
    })
    expect(over?.perTurn).toBe(all?.perTurn)
  })

  test('uses the selected group ratio', () => {
    const twoGroups = {
      ...sonnet,
      enable_groups: ['default', 'vip'],
      group_ratio: { default: 1.5, vip: 3 },
    }
    const cheap = estimateClaudeCodeCost(twoGroups, DEFAULT_WORKLOAD)
    const vip = estimateClaudeCodeCost(twoGroups, DEFAULT_WORKLOAD, 'vip')
    expect(vip?.perTurn).toBeCloseTo((cheap?.perTurn ?? 0) * 2, 9)
  })

  test('has no estimate for per-request models', () => {
    expect(
      estimateClaudeCodeCost({ ...sonnet, quota_type: 1 }, DEFAULT_WORKLOAD)
    ).toBeNull()
  })

  describe('a model priced by context tier', () => {
    // claude-haiku-5-5 as corecode-infra writes it, in a 1.5× group.
    const haiku: PricingModel = {
      ...sonnet,
      model_name: 'claude-haiku-5-5',
      billing_mode: 'tiered_expr',
      billing_expr:
        'len <= 100000 ? tier("standard", p * 0.1 + c * 0.5 + cr * 0.01 + cc * 0.125 + cc1h * 0.2) : tier("long_context", p * 0.5 + c * 2.5 + cr * 0.05 + cc * 0.625 + cc1h * 1)',
    }

    test('prices a short context at the base tier', () => {
      const estimate = estimateClaudeCodeCost(haiku, DEFAULT_WORKLOAD)

      // (54k × 0.01 + 6k × 0.125 + 1.5k × 0.5) × 1.5
      expect(estimate?.perTurn).toBeCloseTo(0.00306, 9)
      expect(estimate?.tier).toBe('standard')
    })

    test('prices a context over 100K at five times the base', () => {
      const estimate = estimateClaudeCodeCost(haiku, {
        ...DEFAULT_WORKLOAD,
        contextTokens: 150_000,
      })

      // (135k × 0.05 + 15k × 0.625 + 1.5k × 2.5) × 1.5
      expect(estimate?.perTurn).toBeCloseTo(0.029812, 6)
      expect(estimate?.tier).toBe('long_context')
    })

    test('bills an unpriced cache kind as plain input', () => {
      const flat = {
        ...haiku,
        billing_expr: 'tier("base", p * 1 + c * 5)',
      }
      const estimate = estimateClaudeCodeCost(flat, DEFAULT_WORKLOAD)

      expect(estimate?.perDay).toBeCloseTo(
        estimate?.perDayWithoutCache ?? -1,
        9
      )
    })
  })
})
