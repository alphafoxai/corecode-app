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
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { EngineDailyCost, FinanceInsights } from '../../types'
import { FinanceTab } from '../finance-tab'

function finance(engine: EngineDailyCost): FinanceInsights {
  return {
    revenue: 0,
    topup_revenue: 0,
    subscription_revenue: 0,
    orders: 0,
    paying_users: 0,
    methods: [],
    daily: [],
    consumption_usd: 220,
    claude_usd: 200,
    revenue_per_usd: 0,
    liability_usd: 0,
    liability_users: 0,
    debt_usd: 0,
    debtors: [],
    top_balances: [],
    adjustments: [],
    adjustment_net_usd: 0,
    commission_usd: 0,
    redemption_usd: 0,
    bonus_usd: 0,
    topup_credit_usd: 0,
    engine_cost: engine,
    matched_official_usd: 100,
    matched_claude_usd: 200,
    official_per_usd: 0.5,
    plans: [
      {
        plan: 'Pro',
        tier: 'default_claude_ai',
        accounts: 3,
        measured: 2,
        week_usd: 250,
        week_low_usd: 240,
        week_high_usd: 260,
      },
    ],
  }
}

const engine: EngineDailyCost = {
  configured: true,
  cost_usd: 100,
  requests: 9,
  daily: [],
}

describe('Claude at official prices on the funds view', () => {
  it('states the official cost of each dollar charged', () => {
    render(<FinanceTab data={finance(engine)} />)
    expect(
      screen.getByText(
        'Each $1 new-api charges for Claude uses $0.50 at official prices.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('$2.00')).toBeInTheDocument()
  })

  it('converts a plan’s weekly official value into new-api dollars', () => {
    render(<FinanceTab data={finance(engine)} />)
    const row = screen.getByRole('row', { name: /default_claude_ai/ })
    const cells = within(row).getAllByRole('cell')
    expect(cells.map((cell) => cell.textContent)).toEqual([
      'Prodefault_claude_ai',
      '2 / 3',
      '$250.00 ($240–$260)',
      '$500.00',
      '$2,142.86',
    ])
  })

  it('shows the engine’s error and no conversion when the read failed', () => {
    render(
      <FinanceTab
        data={finance({
          ...engine,
          error: 'engine /usage/daily returned HTTP 503',
        })}
      />
    )
    expect(
      screen.getByText('engine /usage/daily returned HTTP 503')
    ).toBeInTheDocument()
    const row = screen.getByRole('row', { name: /default_claude_ai/ })
    expect(within(row).getAllByRole('cell')[3].textContent).toBe('-')
  })
})
