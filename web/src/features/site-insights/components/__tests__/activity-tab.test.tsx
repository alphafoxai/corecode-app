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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ActivityInsights, EngineDailyCost } from '../../types'
import { ActivityTab } from '../growth-tab'

const day = (offset: number) => 1761408000 + offset * 86400

function activity(engine: EngineDailyCost): ActivityInsights {
  return {
    active_users: 2,
    quota_usd: 30,
    requests: 9,
    engine_cost: engine,
    daily: [
      { day: day(0), dau: 1, wau: 1, requests: 4, quota_usd: 10 },
      { day: day(1), dau: 2, wau: 2, requests: 5, quota_usd: 20 },
    ],
    retention: [],
    top_users: [],
    top1_share: 0.5,
    top3_share: 1,
    top10_share: 1,
  }
}

describe('official-price cost from the engine', () => {
  it('reads out each day’s official cost beside what new-api charged', () => {
    render(
      <ActivityTab
        data={activity({
          configured: true,
          cost_usd: 12.5,
          requests: 3,
          // The engine leaves out a day with no Claude requests.
          daily: [{ day: day(1), cost_usd: 12.5, requests: 3 }],
        })}
      />
    )
    const chart = screen.getByRole('list', {
      name: 'Daily Claude cost at official prices',
    })
    const bars = chart.querySelectorAll('[tabindex="0"]')
    expect(bars).toHaveLength(2)
    expect(bars[0].getAttribute('aria-label')).toMatch(
      /Official cost \$0\.00.*Charged \$10\.00.*Claude requests 0/
    )
    expect(bars[1].getAttribute('aria-label')).toMatch(
      /Official cost \$12\.50.*Charged \$20\.00.*Claude requests 3/
    )
    expect(
      screen.getByText('Charged $30.00 against $12.50 at official prices.')
    ).toBeInTheDocument()
  })

  it('shows the engine’s error instead of an empty chart', () => {
    render(
      <ActivityTab
        data={activity({
          configured: true,
          error: 'engine /usage/daily returned HTTP 404',
          cost_usd: 0,
          requests: 0,
          daily: [],
        })}
      />
    )
    expect(
      screen.getByText('engine /usage/daily returned HTTP 404')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('list', {
        name: 'Daily Claude cost at official prices',
      })
    ).not.toBeInTheDocument()
  })
})
