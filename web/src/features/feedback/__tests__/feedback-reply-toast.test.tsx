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
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useFeedbackReplyToast } from '../hooks/use-feedback-unread'

const location = vi.hoisted(() => ({ pathname: '/dashboard' }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: (options: { select: (l: typeof location) => string }) =>
    options.select(location),
}))

function mockUnread(count: number) {
  return vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: { count } } })
}

function renderToast() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
  renderHook(() => useFeedbackReplyToast(), { wrapper })
  return client
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  location.pathname = '/dashboard'
})

it('announces unread replies, and again only when the count grows', async () => {
  const get = mockUnread(1)
  const info = vi.spyOn(toast, 'info')
  const client = renderToast()

  await waitFor(() => expect(info).toHaveBeenCalledTimes(1))
  expect(get).toHaveBeenCalledWith('/api/feedback/self/unread', {
    skipErrorHandler: true,
  })

  await client.refetchQueries()
  expect(info).toHaveBeenCalledTimes(1)

  mockUnread(2)
  await client.refetchQueries()
  await waitFor(() => expect(info).toHaveBeenCalledTimes(2))
})

it('stays quiet with no unread reply', async () => {
  const info = vi.spyOn(toast, 'info')
  const get = mockUnread(0)
  renderToast()

  await waitFor(() => expect(get).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(info).not.toHaveBeenCalled()
})

it('stays quiet on the feedback page, which shows the reply itself', async () => {
  location.pathname = '/feedback'
  const info = vi.spyOn(toast, 'info')
  const get = mockUnread(3)
  renderToast()

  await waitFor(() => expect(get).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(info).not.toHaveBeenCalled()
})
