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
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import type { ApiKey } from '../../types'
import { ClientSetupGuide } from '../client-setup-guide'

let client: QueryClient

const key = (fields: Partial<ApiKey>): ApiKey =>
  ({
    id: 7,
    name: 'laptop',
    key: 'abcd**********wxyz',
    status: 1,
    ...fields,
  }) as ApiKey

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(STATUS_QUERY_KEY, {
    system_name: 'CoreCode',
    server_address: 'https://corecode.live/v1',
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: ['claude-opus-5-5'] },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})

async function renderGuide(keys: ApiKey[]) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <ClientSetupGuide keys={keys} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('ClientSetupGuide', () => {
  it('shows the root base URL and a masked key, never the stored secret', async () => {
    await renderGuide([key({})])

    const snippet = await screen.findByLabelText('Configuration snippet')
    expect(snippet).toHaveTextContent(
      '"ANTHROPIC_BASE_URL": "https://corecode.live"'
    )
    expect(snippet).toHaveTextContent('sk-abcd…wxyz')
    expect(snippet).not.toHaveTextContent('/v1')
  })

  it('copies the snippet with the full key fetched for the selected key', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: { key: 'full-secret-value' } },
    })
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    await renderGuide([key({})])

    await user.click(screen.getByRole('tab', { name: 'macOS / Linux' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/api/token/7/key')
    expect(writeText.mock.calls[0][0]).toBe(
      [
        'export ANTHROPIC_BASE_URL=https://corecode.live',
        'export ANTHROPIC_AUTH_TOKEN=sk-full-secret-value',
        'claude',
      ].join('\n')
    )
  })

  it('does not copy anything when the full key cannot be fetched', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: false, message: 'denied' },
    })
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    await renderGuide([key({})])

    await user.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
    )
    expect(writeText).not.toHaveBeenCalled()
  })

  it('offers to create a key and uses a placeholder when no key is enabled', async () => {
    await renderGuide([key({ status: 2 })])

    const createKey = await screen.findByText('Create API Key')
    expect(createKey.closest('a')).toHaveAttribute('href', '/keys')
    expect(screen.getByLabelText('Configuration snippet')).toHaveTextContent(
      'sk-your-key'
    )
    expect(
      screen.queryByRole('button', { name: 'Import to CC Switch' })
    ).not.toBeInTheDocument()
  })

  it('lets the customer pick among several enabled keys', async () => {
    const user = userEvent.setup()
    await renderGuide([
      key({ id: 1, name: 'laptop', key: 'aaaa**********1111' }),
      key({ id: 2, name: 'ci', key: 'bbbb**********2222' }),
    ])

    await user.click(await screen.findByRole('combobox', { name: 'API key' }))
    await user.click(await screen.findByRole('option', { name: 'ci' }))

    expect(screen.getByLabelText('Configuration snippet')).toHaveTextContent(
      'sk-bbbb…2222'
    )
  })
})
