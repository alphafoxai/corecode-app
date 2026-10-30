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
import { describe, expect, it } from 'vitest'

import { HelpIcon, HelpLabel } from '../shared'

const help = 'The part of all money paid that this range earned.'

const definition = () =>
  screen.queryByText(help)?.closest('[data-slot=popover-content]')

describe('a figure’s definition', () => {
  it('opens when its label is hovered', async () => {
    const user = userEvent.setup()
    render(<HelpLabel label='Revenue earned' help={help} />)
    await user.hover(screen.getByRole('button', { name: 'Revenue earned' }))
    await waitFor(() => expect(definition()).toBeInTheDocument())
    expect(definition()).toHaveTextContent(/^Revenue earned/)
  })

  it('opens on a click and stays open when the pointer leaves', async () => {
    const user = userEvent.setup()
    render(<HelpLabel label='Revenue earned' help={help} />)
    const label = screen.getByRole('button', { name: 'Revenue earned' })
    await user.click(label)
    await waitFor(() => expect(definition()).toBeInTheDocument())
    await user.unhover(label)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(definition()).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(definition()).toBeFalsy())
  })

  it('opens from the keyboard', async () => {
    const user = userEvent.setup()
    render(<HelpIcon help={help} title='Funds' />)
    await user.tab()
    expect(
      screen.getByRole('button', { name: 'How this is counted' })
    ).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(definition()).toHaveTextContent(/^Funds/))
  })

  it('leaves a label without a definition plain', () => {
    render(<HelpLabel label='Orders' />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Orders')).toBeInTheDocument()
  })
})
