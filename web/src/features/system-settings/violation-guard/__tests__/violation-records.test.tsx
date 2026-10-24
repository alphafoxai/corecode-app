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
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'

import { ViolationRecords } from '../violation-records'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const NOW = Math.floor(Date.now() / 1000)

function record(
  id: number,
  username: string,
  suspendedUntil: number,
  mode = 'enforce'
) {
  return {
    id,
    user_id: id * 10,
    username,
    created_at: NOW - 60,
    token_id: 1,
    channel_id: 1,
    model_name: 'claude-test',
    request_id: `req-${id}`,
    category: 'cyber',
    excerpt: 'remove the license check',
    action: 'suspend',
    mode,
    suspended_until: suspendedUntil,
  }
}

async function renderRecords() {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    resources: { en },
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
  })
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      message: '',
      data: {
        page: 1,
        page_size: 20,
        total: 3,
        items: [
          record(1, 'suspended-user', NOW + 3600),
          record(2, 'expired-user', NOW - 3600),
          record(3, 'admin-user', 0, 'exempt'),
        ],
      },
    },
  })
  vi.mocked(api.post).mockResolvedValue({
    data: { success: true, message: '' },
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <ViolationRecords />
      </I18nextProvider>
    </QueryClientProvider>
  )
  await screen.findByText('suspended-user')
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('keeps Lift for every customer row and disables it for administrators', async () => {
  await renderRecords()

  // A user whose suspension ended may still have blocked conversations and
  // counted strikes, so Lift stays available; administrators are never restricted.
  const buttons = screen.getAllByRole('button', { name: 'Lift' })
  expect(buttons[0]).toBeEnabled()
  expect(buttons[1]).toBeEnabled()
  expect(buttons[2]).toBeDisabled()
})

it('lifts the restrictions of the chosen user after confirmation', async () => {
  const user = userEvent.setup()
  await renderRecords()

  await user.click(screen.getAllByRole('button', { name: 'Lift' })[0])
  expect(api.post).not.toHaveBeenCalled()
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('does not re-enable an account')
  await user.click(
    screen.getAllByRole('button', { name: 'Lift' }).at(-1) as HTMLElement
  )

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith('/api/user/10/violations/lift')
  )
})

it('requests the records of one user when a user ID filter is entered', async () => {
  const user = userEvent.setup()
  await renderRecords()

  await user.type(screen.getByLabelText('Filter by user ID'), '7')

  await waitFor(() =>
    expect(api.get).toHaveBeenLastCalledWith(
      '/api/user/violations',
      expect.objectContaining({
        params: expect.objectContaining({ user_id: 7 }),
      })
    )
  )
})
