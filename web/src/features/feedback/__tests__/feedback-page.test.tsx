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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { FeedbackPage } from '..'
import type { Feedback } from '../types'

const answered: Feedback = {
  id: 3,
  user_id: 11,
  category: 'bug',
  title: '429 on every request',
  description: 'Since 10:00 every request fails.',
  related_request: '',
  contact: '',
  context: '{}',
  status: 'resolved',
  admin_reply: 'Fixed, thanks',
  reward_quota: 2500000,
  rewarded_by: 1,
  rewarded_time: 1761616920,
  created_time: 1761616000,
  updated_time: 1761616920,
}

function renderPage(items: Feedback[]) {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { items, total: items.length, page: 1, page_size: 50 },
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <FeedbackPage />
    </QueryClientProvider>
  )
  return { get }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('lists my feedback with its status, the reply and the reward', async () => {
  const { get } = renderPage([answered])

  expect(await screen.findByText('429 on every request')).toBeVisible()
  expect(screen.getByText('Resolved')).toBeVisible()
  expect(screen.getByText('Fixed, thanks')).toBeVisible()
  expect(screen.getByText(/Reward credited/)).toBeVisible()
  expect(get).toHaveBeenCalledWith('/api/feedback/self', {
    params: { p: 1, page_size: 50 },
  })
})

it('an empty list shows the empty state', async () => {
  renderPage([])

  expect(await screen.findByText('No feedback yet')).toBeVisible()
})

it('submitting without a title or description shows field errors and sends nothing', async () => {
  renderPage([])
  const post = vi.spyOn(api, 'post')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Submit feedback' }))

  expect(await screen.findByText('Please enter a title')).toBeVisible()
  expect(screen.getByText('Please describe the problem')).toBeVisible()
  expect(post).not.toHaveBeenCalled()
})

it('a valid report is sent trimmed, the form clears and the list reloads', async () => {
  const { get } = renderPage([])
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, message: '' } })
  const user = userEvent.setup()
  await screen.findByText('No feedback yet')
  const before = get.mock.calls.length

  await user.selectOptions(screen.getByLabelText(/^Type/), 'billing')
  await user.type(screen.getByLabelText(/^Title/), '  Charged twice ')
  await user.type(screen.getByLabelText(/^Description/), 'Two charges at 10:02')
  await user.type(screen.getByLabelText('Related request'), 'req-1')
  await user.click(screen.getByRole('button', { name: 'Submit feedback' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/feedback', {
      category: 'billing',
      title: 'Charged twice',
      description: 'Two charges at 10:02',
      related_request: 'req-1',
      contact: '',
    })
  )
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before))
  expect(screen.getByLabelText(/^Title/)).toHaveValue('')
})

it('a failed submission keeps what the customer typed', async () => {
  renderPage([])
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: false,
      message: 'Too much feedback, please try again later.',
    },
  })
  const user = userEvent.setup()
  await screen.findByText('No feedback yet')

  await user.type(screen.getByLabelText(/^Title/), 'Charged twice')
  await user.type(screen.getByLabelText(/^Description/), 'Two charges')
  await user.click(screen.getByRole('button', { name: 'Submit feedback' }))

  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Submit feedback' })
    ).toBeEnabled()
  )
  expect(screen.getByLabelText(/^Title/)).toHaveValue('Charged twice')
})
