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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
          id: 3,
          name: 'alice',
          email: 'alice@example.com',
          created_at: 1,
          used_quota: 7 * QUOTA,
          commission: QUOTA,
          gift_plan: '',
        },
        {
          id: 2,
          name: 'bob',
          email: '',
          created_at: 2,
          used_quota: 0,
          commission: 0,
          gift_plan: '',
        },
      ],
      total: 12,
      page: 1,
      page_size: 20,
      totals: { used_quota: 100 * QUOTA, commission: 30 * QUOTA },
      gift_plan_title: '',
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

  const row = (await screen.findByText('alice')).closest('tr')
  expect(row).not.toBeNull()
  expect(
    within(row as HTMLElement).getByText('alice@example.com')
  ).toBeVisible()
  expect(
    within(row as HTMLElement).getByText(formatQuota(7 * QUOTA))
  ).toBeVisible()
  expect(within(row as HTMLElement).getByText(formatQuota(QUOTA))).toBeVisible()
  expect(screen.getByText('bob')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Gift' })).toBeNull()

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
    gift_plan_title: '',
  })

  expect(await screen.findByText('No invitees yet')).toBeVisible()
  expect(
    screen.getByText('Invitations are not available for your account.')
  ).toBeVisible()
  expect(screen.queryByLabelText('Referral link')).toBeNull()
})

it('gifts the plan to an invitee who can receive it, after confirming', async () => {
  const invitee = (
    id: number,
    name: string,
    gift_plan: '' | 'gifted' | 'owned'
  ) => ({
    id,
    name,
    email: '',
    created_at: id,
    used_quota: 0,
    commission: 0,
    gift_plan,
  })
  renderPage({
    items: [
      invitee(3, 'carol', ''),
      invitee(2, 'bob', 'gifted'),
      invitee(1, 'alice', 'owned'),
    ],
    total: 3,
    page: 1,
    page_size: 20,
    totals: { used_quota: 0, commission: 0 },
    gift_plan_title: 'Trial pack',
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: null } })

  const carol = (await screen.findByText('carol')).closest('tr') as HTMLElement
  expect(screen.getByText('Gifted')).toBeVisible()
  expect(screen.getByText('Already has it')).toBeVisible()
  expect(screen.getAllByRole('button', { name: 'Gift' })).toHaveLength(1)

  fireEvent.click(within(carol).getByRole('button', { name: 'Gift' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('Gift Trial pack')).toBeVisible()
  expect(post).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gift' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/affiliate/self/invitees/3/gift')
  )
})
