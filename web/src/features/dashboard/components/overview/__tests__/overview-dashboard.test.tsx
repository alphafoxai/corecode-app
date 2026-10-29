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
import { cleanup, render, screen } from '@testing-library/react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { prefetchCustomerOverview } from '../../../hooks/use-customer-overview'
import { OverviewDashboard } from '../overview-dashboard'

// The FAQ panel's scroll area reads element animations, which jsdom lacks.
const getAnimationsDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
})

afterAll(() => {
  if (getAnimationsDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      getAnimationsDescriptor
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  }
})

let client: QueryClient
let missedLog: ReturnType<typeof consumeLog> | null
let status: Record<string, unknown>

const consumeLog = (id: number, other: object) => ({
  id,
  user_id: 1,
  created_at: Math.floor(Date.now() / 1000) - id * 60,
  type: 2,
  content: '',
  model_name: 'claude-opus-5-5',
  token_name: 'laptop',
  quota: 1000,
  prompt_tokens: 100,
  completion_tokens: 50,
  other: JSON.stringify(other),
})

beforeEach(() => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'customer',
    role: 1,
    quota: 5_000_000,
    used_quota: 1_000,
    request_count: 2,
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  missedLog = null
  status = {
    announcements_enabled: true,
    announcements: [],
    faq_enabled: true,
    faq: [],
    uptime_kuma_enabled: false,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/status') {
      return { data: { data: status } }
    }
    if (url.startsWith('/api/log/self')) {
      const items = [
        consumeLog(1, { claude: true, cache_tokens: 900, frt: 1200 }),
        consumeLog(2, { claude: true, cache_tokens: 900, frt: 1800 }),
        ...(missedLog ? [missedLog] : []),
      ]
      return { data: { success: true, data: { items, total: 2 } } }
    }
    if (url.startsWith('/api/token/')) {
      return { data: { success: true, data: { items: [] } } }
    }
    if (url === '/api/user/models') {
      return { data: { success: true, data: ['claude-opus-5-5'] } }
    }
    if (url === '/api/data/self') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/perf-metrics/summary') {
      return { data: { success: true, data: { summary: null, models: [] } } }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

async function renderOverview() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('customer overview', () => {
  it('leads with the balance and the Claude Code setup', async () => {
    await renderOverview()

    expect(
      await screen.findByRole('heading', { name: 'Balance' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Connect Claude Code' })
    ).toBeInTheDocument()
  })

  it('reports the cache hit rate and first-token time of recent requests', async () => {
    await renderOverview()

    // 900 cached of 1000 input tokens on each request.
    expect(await screen.findByText('90%')).toBeInTheDocument()
    expect(screen.getByText('Cache grade: good')).toBeInTheDocument()
    expect(screen.getByText('1.5s')).toBeInTheDocument()
  })

  it('leaves out announcement and FAQ panels that have no entries', async () => {
    await renderOverview()
    await screen.findByText('90%')

    expect(screen.queryByText('Announcements')).not.toBeInTheDocument()
    expect(screen.queryByText('FAQ')).not.toBeInTheDocument()
  })

  it('shows the FAQ once the operator has written entries', async () => {
    status.faq = [{ question: 'How do I connect?', answer: 'Copy the config.' }]
    await renderOverview()

    expect(await screen.findByText('FAQ')).toBeInTheDocument()
    expect(screen.queryByText('Announcements')).not.toBeInTheDocument()
  })

  it('lists recent requests with their whole context, cache included', async () => {
    await renderOverview()

    // 100 uncached + 900 cached input tokens, 50 output
    expect(await screen.findAllByText(/1\.0K in \/ 50 out/)).toHaveLength(2)
  })

  it('warns about a long request that missed the cache', async () => {
    missedLog = consumeLog(3, { claude: true, cache_creation_tokens: 286_000 })
    await renderOverview()

    expect(
      await screen.findByText(/long requests missed the cache/)
    ).toBeVisible()
  })

  it('warns when the balance is empty and links to the wallet', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'customer',
      role: 1,
      quota: 0,
      used_quota: 1_000,
      request_count: 2,
    })
    await renderOverview()

    const title = await screen.findByText('Your balance has run out')
    expect(title).toBeVisible()
    expect(screen.queryByText(/long requests missed the cache/)).toBeNull()
  })

  it('reads the requests the dashboard route started instead of repeating them', async () => {
    prefetchCustomerOverview(client)
    await renderOverview()
    await screen.findByText('90%')

    const paths = vi
      .mocked(api.get)
      .mock.calls.map(([url]) => url.split('?')[0])
    for (const path of [
      '/api/data/self',
      '/api/log/self',
      '/api/perf-metrics/summary',
      '/api/token/',
    ]) {
      expect(paths.filter((requested) => requested === path)).toEqual([path])
    }
  })
})
