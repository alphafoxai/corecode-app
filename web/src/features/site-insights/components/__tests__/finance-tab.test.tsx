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

const day = (offset: number) => 1761408000 + offset * 86400

function earned(): FinanceInsights {
  return {
    revenue: 14,
    topup_revenue: 0,
    subscription_revenue: 14,
    orders: 1,
    paying_users: 1,
    methods: [],
    daily: [
      {
        day: day(0),
        topup: 0,
        subscription: 14,
        consumption_usd: 16,
        recognized_revenue: 10.8,
        claude_usd: 0,
      },
      {
        day: day(1),
        topup: 0,
        subscription: 0,
        consumption_usd: 9,
        recognized_revenue: 6.8,
        claude_usd: 0,
      },
    ],
    consumption_usd: 25,
    root_consumption_usd: 30,
    gift_consumption_usd: 8,
    revenue_per_usd: 0.56,
    recognized_revenue: 17.6,
    recognized_wallet_revenue: 12,
    recognized_subscription_revenue: 5.6,
    recognized_per_usd: 0.704,
    liability_usd: 50,
    liability_paid_value: 40,
    liability_users: 1,
    debt_usd: 0,
    debtors: [],
    top_balances: [],
    adjustments: [],
    adjustment_net_usd: 0,
    commission_usd: 0,
    redemption_usd: 0,
    bonus_usd: 0,
    topup_credit_usd: 0,
    adjustment_logs_found: false,
    claude_usd: 0,
    engine_cost: { configured: false, cost_usd: 0, requests: 0, daily: [] },
    matched_official_usd: 0,
    matched_claude_usd: 0,
    official_per_usd: 0,
    plans: [],
  } as FinanceInsights
}

describe('revenue earned', () => {
  it('leads the ratio with revenue earned and keeps the cash basis beside it', () => {
    render(<FinanceTab data={earned()} />)
    expect(screen.getByText('¥17.6')).toBeInTheDocument()
    expect(screen.getByText('Wallets ¥12 · plans ¥5.6')).toBeInTheDocument()
    expect(
      screen.getByText('Gifted $8.00 · root $30.00 left out')
    ).toBeInTheDocument()
    expect(screen.getByText('¥0.704')).toBeInTheDocument()
    expect(
      screen.getByText('Paid use ¥1.04 · cash basis ¥0.56')
    ).toBeInTheDocument()
    expect(
      screen.getByText('1 customers · paid ¥40 · debt $0.00')
    ).toBeInTheDocument()
  })

  it('reads out each day’s revenue earned beside what was consumed', () => {
    render(<FinanceTab data={earned()} />)
    const chart = screen.getByRole('list', { name: 'Daily revenue' })
    const bars = chart.querySelectorAll('[tabindex="0"]')
    expect(bars).toHaveLength(2)
    expect(bars[0].getAttribute('aria-label')).toMatch(
      /Revenue earned ¥10\.8,.*Consumed at list price \$16\.00/
    )
  })
})

function finance(engine: EngineDailyCost): FinanceInsights {
  return {
    revenue: 0,
    topup_revenue: 0,
    subscription_revenue: 0,
    orders: 0,
    paying_users: 0,
    methods: [],
    daily: [
      {
        day: 1761408000,
        topup: 0,
        subscription: 0,
        consumption_usd: 90,
        claude_usd: 80,
      },
      {
        day: 1761494400,
        topup: 0,
        subscription: 0,
        consumption_usd: 130,
        claude_usd: 120,
      },
    ],
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
  // The engine leaves out a day with no Claude requests.
  daily: [{ day: 1761494400, cost_usd: 60, requests: 9 }],
}

describe('Claude at official prices on the funds view', () => {
  it('states the multiple of official prices new-api charges', () => {
    render(<FinanceTab data={finance(engine)} />)
    expect(
      screen.getByText('new-api charges 2.00× official prices for Claude.')
    ).toBeInTheDocument()
    expect(screen.getByText('2.00×')).toBeInTheDocument()
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
      screen.getAllByText('engine /usage/daily returned HTTP 503'),
      'both the daily chart and the totals show it'
    ).toHaveLength(2)
    const row = screen.getByRole('row', { name: /default_claude_ai/ })
    expect(within(row).getAllByRole('cell')[3].textContent).toBe('-')
  })

  it('compares each day’s new-api charge with gpt-load’s official cost', () => {
    render(<FinanceTab data={finance(engine)} />)
    const chart = screen.getByRole('list', {
      name: 'Daily Claude usage: new-api against gpt-load',
    })
    const bars = chart.querySelectorAll('[tabindex="0"]')
    expect(bars).toHaveLength(2)
    expect(bars[0].getAttribute('aria-label')).toMatch(
      /new-api Claude charge \$80\.00.*gpt-load official cost \$0\.00.*Multiple \(new-api ÷ official\) -/
    )
    expect(bars[1].getAttribute('aria-label')).toMatch(
      /new-api Claude charge \$120\.00.*gpt-load official cost \$60\.00.*Multiple \(new-api ÷ official\) 2\.00×.*Claude requests 9/
    )
    expect(bars[1].getAttribute('aria-label')).not.toMatch(/Total/)
  })
})
