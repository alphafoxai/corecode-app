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
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { useNoIndex } from '../use-no-index'

const robots = () =>
  [...document.head.querySelectorAll('meta[name="robots"]')].map(
    (m) => (m as HTMLMetaElement).content
  )

afterEach(cleanup)

it('marks the page noindex while active and removes only its own tag', () => {
  const shipped = document.createElement('meta')
  shipped.name = 'robots'
  shipped.content = 'max-image-preview:large'
  document.head.append(shipped)

  const { rerender, unmount } = renderHook(({ on }) => useNoIndex(on), {
    initialProps: { on: false },
  })
  expect(robots()).toEqual(['max-image-preview:large'])

  rerender({ on: true })
  expect(robots()).toEqual(['max-image-preview:large', 'noindex'])

  rerender({ on: false })
  expect(robots()).toEqual(['max-image-preview:large'])

  rerender({ on: true })
  unmount()
  expect(robots()).toEqual(['max-image-preview:large'])
  shipped.remove()
})
