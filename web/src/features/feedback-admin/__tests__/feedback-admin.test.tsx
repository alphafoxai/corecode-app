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
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import type { Feedback } from '@/features/feedback/types'
import { api } from '@/lib/api'

import { FeedbackAdmin } from '..'

const pending: Feedback = {
  id: 7,
  user_id: 11,
  category: 'bug',
  title: '429 on every request',
  description: 'Since 10:00 every request fails.',
  related_request: '2026-10-28 10:02',
  contact: 'qq 12345',
  context: JSON.stringify({
    user_agent: 'feedback-test/1.0',
    recent_logs: [
      { id: 1, created_at: 1761616920, type: 5, model_name: 'claude-opus' },
    ],
  }),
  status: 'pending',
  admin_reply: '',
  reward_quota: 0,
  rewarded_by: 0,
  rewarded_time: 0,
  replied_time: 0,
  seen_time: 0,
  created_time: 1761616000,
  updated_time: 1761616000,
}

function renderPage(item: Feedback = pending) {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { items: [item], total: 1, page: 1, page_size: 20 },
    },
  })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const page = createRoute({
    getParentRoute: () => auth,
    path: '/feedback-admin/',
    component: FeedbackAdmin,
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([page])]),
    history: createMemoryHistory({ initialEntries: ['/feedback-admin/'] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { get, router }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('lists every report with its account, type and status', async () => {
  const { get } = renderPage()

  expect(await screen.findByText('429 on every request')).toBeVisible()
  expect(screen.getByText('#11')).toBeVisible()
  expect(screen.getByText('Bug')).toBeVisible()
  expect(screen.getByText('Pending')).toBeVisible()
  expect(get).toHaveBeenCalledWith('/api/feedback/admin', {
    params: {
      status: undefined,
      category: undefined,
      keyword: undefined,
      p: 1,
      page_size: 20,
    },
  })
})

it('the keyword filter reloads the list from the first page on Search', async () => {
  const { get, router } = renderPage()
  const user = userEvent.setup()
  await screen.findByText('429 on every request')

  await user.type(screen.getByLabelText('Title or description'), ' 429 ')
  await user.click(screen.getByRole('button', { name: 'Search' }))

  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith('/api/feedback/admin', {
      params: expect.objectContaining({ keyword: '429', p: 1 }),
    })
  )
  expect(router.state.location.search).toMatchObject({
    keyword: '429',
    page: 1,
  })
})

it('saving a review sends the status, reply and reward and reloads the list', async () => {
  const { get } = renderPage()
  const patch = vi
    .spyOn(api, 'patch')
    .mockResolvedValue({ data: { success: true, data: pending } })
  const user = userEvent.setup()
  await screen.findByText('429 on every request')
  const before = get.mock.calls.length

  await user.click(screen.getByRole('button', { name: 'Review' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('feedback-test/1.0')).toBeVisible()
  expect(within(dialog).getByText(/claude-opus/)).toBeVisible()
  await user.selectOptions(within(dialog).getByLabelText('Status'), 'resolved')
  await user.type(
    within(dialog).getByLabelText('Reply to the customer'),
    'Fixed'
  )
  await user.type(within(dialog).getByLabelText('Reward (USD)'), '5')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/api/feedback/admin/7', {
      status: 'resolved',
      admin_reply: 'Fixed',
      reward_usd: 5,
    })
  )
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('a rewarded report shows the reward and cannot be rewarded again', async () => {
  renderPage({ ...pending, status: 'resolved', reward_quota: 2500000 })
  const patch = vi
    .spyOn(api, 'patch')
    .mockResolvedValue({ data: { success: true, data: pending } })
  const user = userEvent.setup()
  await screen.findByText('429 on every request')

  await user.click(screen.getByRole('button', { name: 'Review' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/Already rewarded/)).toBeVisible()
  expect(within(dialog).queryByLabelText('Reward (USD)')).toBeNull()
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      '/api/feedback/admin/7',
      expect.objectContaining({ reward_usd: 0 })
    )
  )
})

it('a reward above the cap disables Save', async () => {
  renderPage()
  const user = userEvent.setup()
  await screen.findByText('429 on every request')

  await user.click(screen.getByRole('button', { name: 'Review' }))
  const dialog = await screen.findByRole('dialog')
  const reward = within(dialog).getByLabelText('Reward (USD)')
  await user.type(reward, '1500')

  expect(reward).toHaveAttribute('aria-invalid', 'true')
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
})
