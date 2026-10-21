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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { ClaudeCodeEstimator } from '../components/claude-code-estimator'
import type { PricingModel } from '../types'

const sonnet: PricingModel = {
  id: 1,
  model_name: 'claude-sonnet-5-5',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 5,
  cache_ratio: 0.05,
  create_cache_ratio: 1.25,
  enable_groups: ['default'],
  group_ratio: { default: 1.5 },
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})

afterEach(() => {
  cleanup()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

function amount(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent
}

it('estimates the default Claude Code workload per turn, day and month', () => {
  render(<ClaudeCodeEstimator models={[sonnet]} />)

  expect(amount('Per turn')).toBe('$0.0531')
  expect(amount('Per day')).toBe('$10.62')
  expect(amount('Per 30 days')).toBe('$318.6')
  expect(screen.getByText(/The cache saves/)).toHaveTextContent('74%')
})

it('recomputes when the customer changes the workload', async () => {
  const user = userEvent.setup()
  render(<ClaudeCodeEstimator models={[sonnet]} />)

  const turns = screen.getByLabelText('Turns per day')
  await user.clear(turns)
  await user.type(turns, '100')

  expect(amount('Per day')).toBe('$5.31')
})

it('offers a model picker only when there is more than one model', () => {
  const { rerender } = render(<ClaudeCodeEstimator models={[sonnet]} />)
  expect(screen.queryByRole('combobox', { name: 'Model' })).not.toBeInTheDocument()

  rerender(
    <ClaudeCodeEstimator
      models={[sonnet, { ...sonnet, id: 2, model_name: 'claude-opus-5-5' }]}
    />
  )
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
    'claude-sonnet-5-5'
  )
})

it('renders nothing for a model priced per request', () => {
  const { container } = render(
    <ClaudeCodeEstimator models={[{ ...sonnet, quota_type: 1 }]} />
  )
  expect(container).toBeEmptyDOMElement()
})
