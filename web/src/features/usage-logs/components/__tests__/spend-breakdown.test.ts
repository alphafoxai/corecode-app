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

import type { FlowQuotaDataItem } from '@/features/dashboard/types'

import { summarizeSpend } from '../../lib/spend-breakdown'

const row = (fields: Partial<FlowQuotaDataItem>): FlowQuotaDataItem => ({
  use_group: 'Claude 满血',
  model_name: 'claude-opus-5-5',
  token_used: 0,
  count: 1,
  quota: 0,
  ...fields,
})

describe('summarizeSpend', () => {
  test('adds up spend per key across models, largest first', () => {
    const rows = [
      row({ token_name: 'ci', quota: 100, count: 2 }),
      row({ token_name: 'laptop', quota: 300, count: 5 }),
      row({
        token_name: 'ci',
        model_name: 'claude-haiku-5-5',
        quota: 50,
        count: 1,
      }),
    ]

    expect(summarizeSpend(rows, (r) => r.token_name ?? '')).toEqual([
      { name: 'laptop', quota: 300, count: 5 },
      { name: 'ci', quota: 150, count: 3 },
    ])
  })

  test('adds up spend per model across keys', () => {
    const rows = [
      row({ token_name: 'ci', quota: 100 }),
      row({ token_name: 'laptop', quota: 300 }),
      row({ token_name: 'ci', model_name: 'claude-haiku-5-5', quota: 50 }),
    ]

    expect(
      summarizeSpend(rows, (r) => r.model_name ?? '').map((r) => [
        r.name,
        r.quota,
      ])
    ).toEqual([
      ['claude-opus-5-5', 400],
      ['claude-haiku-5-5', 50],
    ])
  })

  test('skips rows without a name', () => {
    expect(
      summarizeSpend([row({ quota: 9 })], (r) => r.token_name ?? '')
    ).toEqual([])
  })
})
