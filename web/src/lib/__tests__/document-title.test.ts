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
import { expect, it } from 'vitest'

import { setPageTitle, setSiteTitle } from '../document-title'

it('keeps the page part when the site name arrives later', () => {
  setSiteTitle('CoreCode')
  setPageTitle('模型定价')
  expect(document.title).toBe('模型定价 · CoreCode')
  // main.tsx applies the network copy of /api/status after pages mount.
  setSiteTitle('CoreCode Live')
  expect(document.title).toBe('模型定价 · CoreCode Live')
  setPageTitle(undefined)
  expect(document.title).toBe('CoreCode Live')
})
