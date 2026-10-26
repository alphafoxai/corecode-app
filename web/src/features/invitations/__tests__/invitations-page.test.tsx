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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'

import { Invitations } from '..'
import type { InviteePage } from '../types'

const QUOTA = 500_000

const summary = {
  enabled: true,
  self_serve_rate: 10,
  second_level_rate: 5,
  min_withdrawal: 100,
  affiliate: null,
  aff_code: '',
  invitee_count: 0,
  balance_money: 0,
  earned_money: 0,
}

function renderPage(
  page: InviteePage,
  affiliate: Partial<typeof summary> = {}
) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: {
      success: true,
      data:
        url === '/api/affiliate/self/invitees'
          ? page
          : { ...summary, ...affiliate },
    },
  }))
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const invitations = createRoute({
    getParentRoute: () => auth,
    path: '/invitations/',
    component: Invitations,
  })
  const wallet = createRoute({ getParentRoute: () => auth, path: '/wallet' })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([invitations, wallet])]),
    history: createMemoryHistory({ initialEntries: ['/invitations/'] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return get
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('lists each invitee with their spend and commission, and totals over all invitees', async () => {
  const get = renderPage(
    {
      items: [
        {
          name: 'al***',
          created_at: 1,
          used_quota: 7 * QUOTA,
          commission: QUOTA,
        },
        { name: 'bo***', created_at: 2, used_quota: 0, commission: 0 },
      ],
      total: 12,
      page: 1,
      page_size: 20,
      totals: { used_quota: 100 * QUOTA, commission: 30 * QUOTA },
    },
    {
      affiliate: {
        id: 1,
        user_id: 7,
        rate: 10,
        channel: false,
        granted_by: 0,
        balance: 5 * QUOTA,
        earned: 30 * QUOTA,
        created_at: 1,
        updated_at: 1,
      } as never,
      aff_code: 'AB12',
    }
  )

  const row = (await screen.findByText('al***')).closest('tr')
  expect(row).not.toBeNull()
  expect(
    within(row as HTMLElement).getByText(formatQuota(7 * QUOTA))
  ).toBeVisible()
  expect(within(row as HTMLElement).getByText(formatQuota(QUOTA))).toBeVisible()
  expect(screen.getByText('bo***')).toBeVisible()

  const stats = screen.getByText('Invites').closest('dl') as HTMLElement
  expect(within(stats).getByText('12')).toBeVisible()
  expect(within(stats).getByText(formatQuota(100 * QUOTA))).toBeVisible()
  expect(within(stats).getByText(formatQuota(30 * QUOTA))).toBeVisible()
  expect(within(stats).getByText(formatQuota(5 * QUOTA))).toBeVisible()

  const link = (await screen.findByLabelText(
    'Referral link'
  )) as HTMLInputElement
  expect(link.value).toMatch(/aff=AB12$/)
  expect(get).toHaveBeenCalledWith('/api/affiliate/self/invitees', {
    params: { p: 1, page_size: 20 },
  })
})

it('says invitations are unavailable when the user has no rate and shows the empty state', async () => {
  renderPage({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    totals: { used_quota: 0, commission: 0 },
  })

  expect(await screen.findByText('No invitees yet')).toBeVisible()
  expect(
    screen.getByText('Invitations are not available for your account.')
  ).toBeVisible()
  expect(screen.queryByLabelText('Referral link')).toBeNull()
})
