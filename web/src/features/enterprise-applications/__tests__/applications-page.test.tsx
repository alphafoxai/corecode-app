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

import { api } from '@/lib/api'

import { EnterpriseApplications } from '..'
import type { EnterpriseApplication } from '../types'

const pending: EnterpriseApplication = {
  id: 7,
  company: 'Acme Ltd',
  contact_name: 'Lin',
  email: 'lin@acme.example',
  other_contact: '@lin',
  monthly_spend: '5k_20k',
  use_case: 'Code review',
  message: '',
  user_id: 0,
  ip: '203.0.113.7',
  status: 'pending',
  admin_note: '',
  created_time: 1761400000,
  updated_time: 1761400000,
}

function renderPage() {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { items: [pending], total: 1, page: 1, page_size: 20 },
    },
  })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const page = createRoute({
    getParentRoute: () => auth,
    path: '/enterprise-applications/',
    component: EnterpriseApplications,
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([page])]),
    history: createMemoryHistory({
      initialEntries: ['/enterprise-applications/'],
    }),
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

it('lists applications with their spend band and status', async () => {
  const { get } = renderPage()

  expect(await screen.findByText('Acme Ltd')).toBeVisible()
  expect(screen.getByText('lin@acme.example')).toBeVisible()
  expect(screen.getByText('$5,000 - $20,000')).toBeVisible()
  expect(screen.getByText('Pending')).toBeVisible()
  expect(get).toHaveBeenCalledWith('/api/enterprise/applications', {
    params: { status: undefined, keyword: undefined, p: 1, page_size: 20 },
  })
})

it('the keyword filter reloads the list from the first page on Search', async () => {
  const { get, router } = renderPage()
  const user = userEvent.setup()
  await screen.findByText('Acme Ltd')

  await user.type(screen.getByLabelText('Company, contact or email'), ' acme ')
  await user.click(screen.getByRole('button', { name: 'Search' }))

  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith('/api/enterprise/applications', {
      params: expect.objectContaining({ keyword: 'acme', p: 1 }),
    })
  )
  expect(router.state.location.search).toMatchObject({
    keyword: 'acme',
    page: 1,
  })
})

it('saving a review sends the new status and note and reloads the list', async () => {
  const { get } = renderPage()
  const patch = vi
    .spyOn(api, 'patch')
    .mockResolvedValue({ data: { success: true, message: '' } })
  const user = userEvent.setup()
  await screen.findByText('Acme Ltd')
  const before = get.mock.calls.length

  await user.click(screen.getByRole('button', { name: 'Review' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('203.0.113.7')).toBeVisible()
  await user.selectOptions(within(dialog).getByLabelText('Status'), 'contacted')
  await user.type(
    within(dialog).getByLabelText('Internal note'),
    'quoted 15% off'
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/api/enterprise/applications/7', {
      status: 'contacted',
      admin_note: 'quoted 15% off',
    })
  )
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})
