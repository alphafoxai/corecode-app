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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { WalletStatsCard } from '../components/wallet-stats-card'
import type { UserWalletData } from '../types'

const QUOTA_PER_DOLLAR = 500_000
let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})

function renderBalance(user: Partial<UserWalletData>, spendRows: object[]) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: spendRows },
  })
  return render(
    <QueryClientProvider client={client}>
      <WalletStatsCard user={user as UserWalletData} />
    </QueryClientProvider>
  )
}

it('shows the balance with its runway and last week of spend', async () => {
  const today = Math.floor(Date.now() / 1000)
  renderBalance(
    { quota: 30 * QUOTA_PER_DOLLAR, used_quota: 0, request_count: 7 },
    [{ created_at: today, quota: 10 * QUOTA_PER_DOLLAR, count: 7 }]
  )

  // $30 at $10 a day
  expect(
    await screen.findByText('About 3 days at your recent daily spend')
  ).toBeVisible()
  expect(screen.getByText('Last 7 days').nextElementSibling).toHaveTextContent(
    '$10'
  )
  expect(screen.getByText('$30')).toBeVisible()
  expect(screen.getByText('Healthy')).toBeVisible()
})

it('marks an empty balance as depleted', async () => {
  renderBalance({ quota: 0, used_quota: 0, request_count: 0 }, [])

  expect(
    await screen.findByText('Runway appears after your first requests')
  ).toBeVisible()
  expect(screen.getByText('Balance depleted')).toBeVisible()
})
