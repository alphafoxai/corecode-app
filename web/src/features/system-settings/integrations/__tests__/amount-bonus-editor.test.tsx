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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  parseBonusTiers,
  percentToRate,
  rateToPercent,
  removeBonusTier,
  upsertBonusTier,
} from '../amount-bonus-tiers'
import { AmountBonusVisualEditor } from '../amount-bonus-visual-editor'

describe('amount bonus tiers', () => {
  it('converts between percent and the stored fraction', () => {
    expect(percentToRate(5)).toBe(0.05)
    expect(percentToRate(7)).toBe(0.07)
    expect(percentToRate(12.5)).toBe(0.125)
    expect(rateToPercent(0.07)).toBe(7)
  })

  it('parses sorted tiers and tolerates bad input', () => {
    expect(parseBonusTiers('{"1000":0.1,"300":0.05}')).toEqual([
      { amount: 300, rate: 0.05 },
      { amount: 1000, rate: 0.1 },
    ])
    expect(parseBonusTiers('')).toEqual([])
    expect(parseBonusTiers('[1,2]')).toEqual([])
  })

  it('replaces the edited tier when its amount changes and removes tiers', () => {
    const value = '{"300":0.05}'
    const moved = upsertBonusTier(value, { amount: 500, rate: 0.06 }, 300)
    expect(JSON.parse(moved)).toEqual({ '500': 0.06 })
    expect(JSON.parse(removeBonusTier(moved, 500))).toEqual({})
  })
})

function Harness(props: {
  initial: string
  onChange: (value: string) => void
}) {
  const [value, setValue] = useState(props.initial)
  return (
    <AmountBonusVisualEditor
      value={value}
      onChange={(next) => {
        props.onChange(next)
        setValue(next)
      }}
    />
  )
}

describe('amount bonus editor', () => {
  it('saves a typed percent as a fraction keyed by amount', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial='{}' onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /Add bonus tier/ }))
    await user.type(screen.getByLabelText('Recharge Amount (USD)'), '300')
    await user.type(screen.getByLabelText('Bonus Percent'), '5')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(JSON.parse(onChange.mock.calls[0][0])).toEqual({ '300': 0.05 })
  })

  it('does not save a bonus above 100%', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial='{}' onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /Add bonus tier/ }))
    await user.type(screen.getByLabelText('Recharge Amount (USD)'), '300')
    await user.type(screen.getByLabelText('Bonus Percent'), '150')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // The input's max blocks submission, as it does in the browser.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lists existing tiers as percents', () => {
    render(<Harness initial='{"300":0.05,"1000":0.1}' onChange={vi.fn()} />)

    expect(screen.getAllByText(/5%/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/10%/).length).toBeGreaterThan(0)
  })
})
