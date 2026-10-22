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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { PriceBoard } from '../components/price-board'
import type { PricingModel } from '../types'

const GROUP = 'Claude 满血'

const opus: PricingModel = {
  id: 1,
  model_name: 'claude-opus-5-5',
  quota_type: 0,
  model_ratio: 2,
  completion_ratio: 5,
  cache_ratio: 0.05,
  create_cache_ratio: 1.25,
  enable_groups: [GROUP],
  group_ratio: { [GROUP]: 1.5 },
}

afterEach(cleanup)

function renderBoard(price: number, rate: number, onModelClick = vi.fn()) {
  render(
    <PriceBoard
      models={[opus]}
      groupRatio={{ [GROUP]: 1.5 }}
      usableGroup={{ [GROUP]: '仅限 Claude Code CLI 使用' }}
      priceRate={price}
      usdExchangeRate={rate}
      onModelClick={onModelClick}
    />
  )
  return onModelClick
}

function desktopRow() {
  const table = screen.getByRole('table')
  return within(table).getByRole('row', { name: /claude-opus-5-5/ })
}

it('lists group prices in CNY against the struck official price', () => {
  renderBoard(1, 6.8)

  const row = desktopRow()
  expect(within(row).getByText('¥6')).toBeVisible()
  expect(within(row).getByText('Official ¥27.2')).toBeVisible()
  expect(within(row).getByText('Save 78%')).toBeVisible()
  expect(screen.getByText('仅限 Claude Code CLI 使用')).toBeVisible()
  expect(
    screen.getByRole('radio', { name: new RegExp(GROUP) })
  ).toHaveAttribute('aria-checked', 'true')
})

it('shows official prices alone when switched', async () => {
  renderBoard(1, 6.8)
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Official price' }))

  const row = desktopRow()
  expect(within(row).getByText('¥27.2')).toBeVisible()
  expect(within(row).queryByText(/Save/)).not.toBeInTheDocument()
})

it('claims no saving when the group price is above the official price', () => {
  renderBoard(7.3, 7.3)
  expect(within(desktopRow()).queryByText(/Save/)).not.toBeInTheDocument()
})

it('opens the model details from the model name', async () => {
  const onModelClick = renderBoard(1, 6.8)
  await userEvent.setup().click(
    within(screen.getByRole('table')).getByRole('button', {
      name: 'claude-opus-5-5',
    })
  )
  expect(onModelClick).toHaveBeenCalledWith('claude-opus-5-5')
})
