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

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'
import {
  buildCostCheck,
  getCacheGrade,
  getInputCacheTokens,
  isCostlyCacheMiss,
} from '../cost-check'

function log(fields: Partial<UsageLog>): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 0,
    type: 2,
    content: '',
    username: '',
    token_name: '',
    model_name: 'claude-opus-5-5',
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: true,
    channel: 0,
    channel_name: '',
    token_id: 0,
    group: '',
    ip: '',
    other: '',
    request_id: '',
    upstream_request_id: '',
    ...fields,
  }
}

// claude-opus-5-5 on production: $4/M input, ×5 output, 0.05 cache read,
// 1.25 cache write, in a 1.5× group.
const opus: LogOtherData = {
  claude: true,
  model_ratio: 2,
  group_ratio: 1.5,
  completion_ratio: 5,
  cache_ratio: 0.05,
  cache_creation_ratio: 1.25,
}

describe('buildCostCheck', () => {
  test('rebuilds an Anthropic charge line by line and matches the logged quota', () => {
    const other = {
      ...opus,
      cache_tokens: 40_000,
      cache_creation_tokens: 2_000,
    }
    // (100 + 40000×0.05 + 2000×1.25 + 500×5) × 2 × 1.5 = 21300
    const check = buildCostCheck(
      log({ prompt_tokens: 100, completion_tokens: 500, quota: 21_300 }),
      other
    )

    expect(check?.lines.map((line) => [line.kind, line.tokens])).toEqual([
      ['input', 100],
      ['cache-read', 40_000],
      ['cache-write', 2_000],
      ['output', 500],
    ])
    expect(check?.lines[0].unitPriceUSD).toBe(6)
    expect(check?.expected).toBe(21_300)
    expect(check?.status).toBe('match')
  })

  test('prices split 5m and 1h cache writes with their own ratios', () => {
    const other = {
      ...opus,
      cache_creation_tokens: 300,
      cache_creation_tokens_5m: 100,
      cache_creation_tokens_1h: 100,
      cache_creation_ratio_5m: 1.25,
      cache_creation_ratio_1h: 2,
    }
    const check = buildCostCheck(log({ prompt_tokens: 0 }), other)

    expect(check?.lines.map((line) => line.kind)).toEqual([
      'input',
      'cache-write',
      'cache-write-5m',
      'cache-write-1h',
      'output',
    ])
    // (100×1.25 + 100×1.25 + 100×2) × 3 = 1350
    expect(check?.expected).toBe(1350)
  })

  test('takes cache out of OpenAI-shaped prompt tokens before pricing input', () => {
    const other: LogOtherData = {
      model_ratio: 1,
      group_ratio: 1,
      completion_ratio: 4,
      cache_ratio: 0.1,
      cache_tokens: 600,
    }
    const check = buildCostCheck(
      log({ prompt_tokens: 1000, completion_tokens: 10, quota: 500 }),
      other
    )

    expect(check?.lines[0]).toMatchObject({ kind: 'input', tokens: 400 })
    // 400 + 600×0.1 + 10×4 = 500
    expect(check?.expected).toBe(500)
    expect(check?.status).toBe('match')
  })

  test('tolerates the one unit rounding can add but flags a larger gap', () => {
    const other = { ...opus }
    const base = { prompt_tokens: 10, completion_tokens: 0 }
    expect(buildCostCheck(log({ ...base, quota: 31 }), other)?.status).toBe(
      'match'
    )
    expect(buildCostCheck(log({ ...base, quota: 40 }), other)?.status).toBe(
      'adjusted'
    )
  })

  test('marks a tool-call surcharge as adjusted even when the totals agree', () => {
    const other = {
      ...opus,
      web_search: true,
      web_search_call_count: 1,
      web_search_price: 0.01,
    }
    expect(
      buildCostCheck(log({ prompt_tokens: 10, quota: 30 }), other)?.status
    ).toBe('adjusted')
  })

  test.each([
    ['per-call pricing', { ...opus, model_price: 0.1 }],
    ['dynamic pricing', { ...opus, billing_mode: 'tiered_expr' }],
    ['a task', { ...opus, is_task: true }],
    ['missing ratios', { claude: true }],
  ])('does not rebuild %s', (_name, other) => {
    expect(buildCostCheck(log({ prompt_tokens: 10 }), other)).toBeNull()
  })

  // The same usage and ratios as service/text_quota_test.go, so a change to
  // the backend formula shows up here.
  test.each([
    [
      'Anthropic with split cache writes',
      { prompt_tokens: 1000, completion_tokens: 200 },
      {
        usage_semantic: 'anthropic',
        cache_tokens: 100,
        cache_creation_tokens: 50,
        cache_creation_tokens_5m: 10,
        cache_creation_tokens_1h: 20,
        cache_creation_ratio_5m: 1.25,
        cache_creation_ratio_1h: 2,
      },
      1488,
    ],
    [
      'OpenAI cache write',
      { prompt_tokens: 1473, completion_tokens: 19 },
      { cache_creation_tokens: 1470 },
      1879,
    ],
    [
      'OpenAI cache overlapping the prompt',
      { prompt_tokens: 3619, completion_tokens: 36 },
      { cache_tokens: 2921, cache_creation_tokens: 3616 },
      4884,
    ],
  ])('agrees with the backend fixture: %s', (_name, usage, extra, quota) => {
    const other: LogOtherData = {
      model_ratio: 1,
      group_ratio: 1,
      completion_ratio: 2,
      cache_ratio: 0.1,
      cache_creation_ratio: 1.25,
      ...extra,
    }
    const check = buildCostCheck(log({ ...usage, quota }), other)
    expect(check?.expected).toBe(quota)
    expect(check?.status).toBe('match')
  })

  test('only checks consume logs', () => {
    expect(buildCostCheck(log({ type: 1, prompt_tokens: 10 }), opus)).toBeNull()
    expect(buildCostCheck(log({ prompt_tokens: 10 }), null)).toBeNull()
  })
})

describe('getInputCacheTokens', () => {
  test('adds cache back to Anthropic input', () => {
    expect(
      getInputCacheTokens(
        { prompt_tokens: 100 },
        { claude: true, cache_tokens: 800, cache_creation_tokens: 100 }
      )
    ).toEqual({ cacheRead: 800, totalInput: 1000 })
  })

  test('leaves OpenAI-shaped input as reported', () => {
    expect(
      getInputCacheTokens({ prompt_tokens: 1000 }, { cache_tokens: 600 })
    ).toEqual({ cacheRead: 600, totalInput: 1000 })
  })
})

describe('getCacheGrade', () => {
  test.each([
    [0.95, 'good'],
    [0.8, 'good'],
    [0.79, 'fair'],
    [0.5, 'fair'],
    [0.49, 'poor'],
    [0, 'poor'],
  ] as const)('grades %d as %s', (rate, grade) => {
    expect(getCacheGrade(rate)).toBe(grade)
  })
})

describe('isCostlyCacheMiss', () => {
  test.each([
    ['286K context, nothing cached', 286_000, 0, true],
    ['60K context, 10% cached', 54_000, 6_000, true],
    ['60K context, 30% cached', 42_000, 18_000, false],
    ['40K context, nothing cached', 40_000, 0, false],
  ])('%s → %s', (_name, written, read, expected) => {
    expect(
      isCostlyCacheMiss(log({ prompt_tokens: 10 }), {
        claude: true,
        cache_creation_tokens: written,
        cache_tokens: read,
      })
    ).toBe(expected)
  })

  test('ignores logs that are not consumption', () => {
    expect(
      isCostlyCacheMiss(log({ type: 5, prompt_tokens: 100_000 }), {
        claude: true,
      })
    ).toBe(false)
  })
})
