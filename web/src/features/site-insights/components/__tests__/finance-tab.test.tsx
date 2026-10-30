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

import type { FinanceInsights } from '../../types'
import { FinanceTab } from '../finance-tab'

const day = (offset: number) => 1761408000 + offset * 86400

function finance(): FinanceInsights {
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
      },
      {
        day: day(1),
        topup: 0,
        subscription: 0,
        consumption_usd: 9,
        recognized_revenue: 6.8,
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
  } as FinanceInsights
}

describe('revenue earned', () => {
  it('leads the ratio with revenue earned and keeps the cash basis beside it', () => {
    render(<FinanceTab data={finance()} />)
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
    render(<FinanceTab data={finance()} />)
    const chart = screen.getByRole('list', { name: 'Daily revenue' })
    const bars = chart.querySelectorAll('[tabindex="0"]')
    expect(bars).toHaveLength(2)
    expect(bars[0].getAttribute('aria-label')).toMatch(
      /Revenue earned ¥10\.8,.*Consumed at list price \$16\.00/
    )
  })
})
