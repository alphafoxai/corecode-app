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
import { act, render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { ModelCheckBanner } from '../components/model-check-banner'

// The shape corecode-infra's model-trace.py writes to latest.json.
const LATEST = {
  date: '2026-10-28',
  started_at: '2026-10-28T08:49:12+00:00',
  run: '/docs/verify/model-trace/2026-10-28.json',
  report: '/docs/verify/#trace',
  models: [
    {
      model: 'claude-opus-5-5',
      in_bank: true,
      rounds: 3,
      rounds_total: 3,
      claude: 0.99906,
      self: 0.999,
      top: 'claude-opus-5-5',
    },
    {
      model: 'claude-sonnet-5-5',
      in_bank: true,
      rounds: 3,
      rounds_total: 3,
      claude: 0.876,
      self: 0.873,
      top: 'claude-sonnet-5-5',
    },
    {
      model: 'claude-haiku-5-5',
      in_bank: true,
      rounds: 0,
      rounds_total: 3,
      claude: null,
      self: null,
      top: null,
    },
  ],
}

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  )
}

function renderBanner() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ModelCheckBanner />
    </QueryClientProvider>
  )
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await act(() => i18next.changeLanguage('en'))
})

it('shows each checked model with its Claude probability', async () => {
  respond(200, LATEST)
  renderBanner()
  const list = await screen.findByRole('list')
  expect(
    within(list).getByText('claude-opus-5-5').parentElement
  ).toHaveTextContent('100%')
  expect(
    within(list).getByText('claude-sonnet-5-5').parentElement
  ).toHaveTextContent('88%')
  // A model with no valid round has no figure to show.
  expect(within(list).queryByText('claude-haiku-5-5')).toBeNull()
  expect(screen.getByText(/on 2026\u201110\u201128/)).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith('/docs/verify/model-trace/latest.json', {
    cache: 'no-cache',
  })
})

it('keeps the description and the link when the summary is missing', async () => {
  respond(404, {})
  renderBanner()
  expect(
    await screen.findByText(/we fingerprint each Claude model/)
  ).toBeInTheDocument()
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.getByRole('link', { name: 'View report' })).toHaveAttribute(
    'href',
    '/docs/en/verify/#trace'
  )
})

it('ignores a summary that is not the expected shape', async () => {
  respond(200, { date: 20261028, models: 'none' })
  renderBanner()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
  expect(
    await screen.findByText(/we fingerprint each Claude model/)
  ).toBeInTheDocument()
  expect(screen.queryByRole('list')).toBeNull()
})

it('links the Chinese report and formats for the interface language', async () => {
  respond(200, LATEST)
  await act(() => i18next.changeLanguage('zhTW'))
  renderBanner()
  await screen.findByRole('list')
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    '/docs/verify/#trace'
  )
  await act(() => i18next.changeLanguage('fr'))
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    '/docs/en/verify/#trace'
  )
  // French puts a narrow no-break space before the percent sign.
  expect(
    screen.getByText('claude-opus-5-5').parentElement?.textContent
  ).toMatch(/100\s%/)
})
