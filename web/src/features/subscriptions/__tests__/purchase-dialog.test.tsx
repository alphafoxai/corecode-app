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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SubscriptionPurchaseDialog } from '../components/dialogs/subscription-purchase-dialog'
import type { PlanRecord } from '../types'

afterEach(() => {
  cleanup()
})

const plan: PlanRecord = {
  plan: {
    id: 1,
    title: 'Starter pack',
    price_amount: 9.9,
    currency: 'USD',
    duration_unit: 'day',
    duration_value: 7,
    quota_reset_period: 'never',
    enabled: true,
    sort_order: 0,
    allow_balance_pay: false,
    allow_wallet_overflow: true,
    max_purchase_per_user: 1,
    total_amount: 6000000,
  },
}

function renderDialog(record: PlanRecord) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SubscriptionPurchaseDialog
        open
        onOpenChange={vi.fn()}
        plan={record}
        enableOnlineTopUp
        epayMethods={[{ type: 'alipay', name: 'Alipay' }]}
      />
    </QueryClientProvider>
  )
}

describe('subscription purchase dialog', () => {
  // Epay charges price_amount as is, in CNY; the stored currency is always
  // USD and says nothing about what the customer pays.
  it('shows the price in the payment currency', () => {
    renderDialog(plan)

    expect(screen.getByText('¥9.9')).toBeVisible()
  })

  // The balance box quotes the price in quota, in the display currency. Next
  // to a CNY price it reads as a second, different price, so a plan that
  // cannot be paid from balance does not show it.
  it('hides balance payment when the plan does not allow it', () => {
    renderDialog(plan)

    expect(screen.queryByText(/\$9\.9/)).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Pay with Balance' })
    ).toBeNull()
  })

  it('keeps balance payment for a plan that allows it', () => {
    renderDialog({ plan: { ...plan.plan, allow_balance_pay: true } })

    expect(
      screen.getByRole('button', { name: 'Pay with Balance' })
    ).toBeVisible()
  })
})
