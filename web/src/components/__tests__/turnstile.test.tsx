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
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Turnstile } from '../turnstile'

afterEach(() => {
  cleanup()
  document.getElementById('cf-turnstile')?.remove()
  delete window.turnstile
})

it('loads the script once and renders when it arrives', () => {
  const { container } = render(<Turnstile siteKey='site' onVerify={vi.fn()} />)
  const script = document.getElementById('cf-turnstile')
  expect(script).toHaveAttribute(
    'src',
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  )

  const renderWidget = vi.fn()
  window.turnstile = { render: renderWidget }
  script?.dispatchEvent(new Event('load'))

  expect(renderWidget).toHaveBeenCalledWith(
    container.firstChild,
    expect.objectContaining({ sitekey: 'site' })
  )
})

// The sign-in page swaps forms while the script may still be loading; the
// widget that mounts second still renders once the script arrives.
it('renders a widget that mounts while another widget is loading the script', () => {
  const first = render(<Turnstile siteKey='site' onVerify={vi.fn()} />)
  first.unmount()
  const { container } = render(<Turnstile siteKey='site' onVerify={vi.fn()} />)
  expect(document.querySelectorAll('#cf-turnstile')).toHaveLength(1)

  const renderWidget = vi.fn()
  window.turnstile = { render: renderWidget }
  document.getElementById('cf-turnstile')?.dispatchEvent(new Event('load'))

  expect(renderWidget).toHaveBeenCalledTimes(1)
  expect(renderWidget).toHaveBeenCalledWith(
    container.firstChild,
    expect.objectContaining({ sitekey: 'site' })
  )
})
