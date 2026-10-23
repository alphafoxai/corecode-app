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

import {
  ALL_MODELS,
  buildCachePrices,
  estimateCacheSavings,
  getBucketStart,
  getCacheHitRate,
  getSeriesUsage,
  summarizeCacheHitRate,
} from '../cache-hit-rate'

function localSeconds(...args: [number, number, number, number?]): number {
  const [year, month, day, hour = 0] = args
  return Math.floor(new Date(year, month - 1, day, hour).getTime() / 1000)
}

function row(
  createdAt: number,
  model: string,
  read: number,
  write: number
): QuotaDataItem {
  return {
    created_at: createdAt,
    model_name: model,
    cache_read_tokens: read,
    cache_creation_tokens: write,
  }
}

describe('getCacheHitRate', () => {
  test('is reads over reads plus writes, null without cache use', () => {
    expect(getCacheHitRate({ readTokens: 80, writeTokens: 20 })).toBe(0.8)
    expect(getCacheHitRate({ readTokens: 0, writeTokens: 0 })).toBeNull()
  })
})

describe('getBucketStart', () => {
  test('floors to the local hour, day and Monday-based week', () => {
    // Thursday 2026-10-22 15:42 local time.
    const at = localSeconds(2026, 10, 22, 15) + 42 * 60
    expect(getBucketStart(at, 'hour')).toBe(localSeconds(2026, 10, 22, 15))
    expect(getBucketStart(at, 'day')).toBe(localSeconds(2026, 10, 22))
    expect(getBucketStart(at, 'week')).toBe(localSeconds(2026, 10, 19))
  })
})

describe('summarizeCacheHitRate', () => {
  const range = {
    start: localSeconds(2026, 10, 17),
    end: localSeconds(2026, 10, 20),
  }

  test('keeps empty days and splits each day by model', () => {
    const summary = summarizeCacheHitRate(
      [
        row(localSeconds(2026, 10, 17, 9), 'claude-opus-5-5', 900, 100),
        row(localSeconds(2026, 10, 17, 10), 'claude-haiku-5-5', 50, 50),
        row(localSeconds(2026, 10, 19, 23), 'claude-opus-5-5', 600, 400),
      ],
      range,
      'day'
    )

    expect(summary.buckets.map((bucket) => bucket.start)).toEqual([
      localSeconds(2026, 10, 17),
      localSeconds(2026, 10, 18),
      localSeconds(2026, 10, 19),
    ])
    expect(getCacheHitRate(summary.buckets[0])).toBeCloseTo(950 / 1100)
    expect(getCacheHitRate(summary.buckets[1])).toBeNull()
    expect(
      getCacheHitRate(getSeriesUsage(summary.buckets[0], 'claude-haiku-5-5'))
    ).toBe(0.5)
    expect(summary.models).toEqual(['claude-opus-5-5', 'claude-haiku-5-5'])
    expect(getCacheHitRate(getSeriesUsage(summary, ALL_MODELS))).toBeCloseTo(
      1550 / 2100
    )
    expect(
      getCacheHitRate(getSeriesUsage(summary, 'claude-opus-5-5'))
    ).toBeCloseTo(1500 / 2000)
  })

  test('ignores rows without cache use or outside the range', () => {
    const summary = summarizeCacheHitRate(
      [
        row(localSeconds(2026, 10, 17, 9), 'gpt-5', 0, 0),
        row(localSeconds(2026, 10, 16, 23), 'claude-opus-5-5', 10, 0),
        row(localSeconds(2026, 10, 20, 1), 'claude-opus-5-5', 10, 0),
      ],
      range,
      'day'
    )

    expect(summary.models).toEqual([])
    expect(getCacheHitRate(summary)).toBeNull()
    expect(getSeriesUsage(summary, 'gpt-5')).toEqual({
      readTokens: 0,
      writeTokens: 0,
    })
  })
})

describe('cache savings', () => {
  const pricingModel = {
    quota_type: 0,
    model_ratio: 2.5,
    cache_ratio: 0.1,
    create_cache_ratio: 1.25,
  }

  test('prices a model at the first auto group that serves it', () => {
    const prices = buildCachePrices(
      [
        {
          ...pricingModel,
          model_name: 'claude-opus-5-5',
          enable_groups: ['default', 'Claude 满血'],
        },
        {
          ...pricingModel,
          model_name: 'claude-haiku-5-5',
          cache_ratio: null,
          create_cache_ratio: null,
          enable_groups: ['default', 'vip'],
        },
        {
          ...pricingModel,
          model_name: 'per-call',
          quota_type: 1,
          enable_groups: ['default'],
        },
      ],
      { default: 1, vip: 0.8, 'Claude 满血': 1.75 },
      ['Claude 满血']
    )

    expect(prices.get('claude-opus-5-5')).toEqual({
      inputQuota: 2.5 * 1.75,
      readRatio: 0.1,
      writeRatio: 1.25,
    })
    // No auto group serves it: the cheapest serving group, backend defaults.
    expect(prices.get('claude-haiku-5-5')).toEqual({
      inputQuota: 2.5 * 0.8,
      readRatio: 1,
      writeRatio: 1.25,
    })
    expect(prices.has('per-call')).toBe(false)
  })

  test('nets the write premium off the read savings', () => {
    const summary = summarizeCacheHitRate(
      [
        row(localSeconds(2026, 10, 17, 9), 'claude-opus-5-5', 1000, 100),
        row(localSeconds(2026, 10, 17, 9), 'unpriced', 500, 0),
      ],
      { start: localSeconds(2026, 10, 17), end: localSeconds(2026, 10, 18) },
      'day'
    )
    const prices = new Map([
      ['claude-opus-5-5', { inputQuota: 2, readRatio: 0.1, writeRatio: 1.25 }],
    ])

    const all = estimateCacheSavings(summary, ALL_MODELS, prices)
    expect(all.saved).toBeCloseTo(1000 * 2 * 0.9)
    expect(all.writePremium).toBeCloseTo(100 * 2 * 0.25)
    expect(all.complete).toBe(false)
    expect(
      estimateCacheSavings(summary, 'claude-opus-5-5', prices).complete
    ).toBe(true)
  })
})
