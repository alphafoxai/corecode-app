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
import { describe, expect, test } from 'vitest'

import {
  coreKeys,
  splitLocale,
} from '../../scripts/i18n-locale-split-loader.mjs'
import zh from './locales/zh.json'

const keys = coreKeys(zh.translation)

describe('the locale split for the core pages', () => {
  test('puts every key in exactly one part', () => {
    const core = splitLocale(zh, 'core', keys).translation
    const rest = splitLocale(zh, 'rest', keys).translation
    expect({ ...core, ...rest }).toEqual(zh.translation)
    expect(Object.keys(core).filter((key) => key in rest)).toEqual([])
    expect(Object.keys(rest).length).toBeGreaterThan(0)
  })

  test('keeps keys the core pages name, through aliases and lazy imports', () => {
    // The sign-in form (routes/(auth)/sign-in.tsx -> @/features/auth/sign-in).
    expect(keys.has('Sign-in code sent, please check your inbox')).toBe(true)
    // The key drawer the keys page mounts.
    expect(keys.has('Successfully created {{count}} API Key(s)')).toBe(true)
    // A chart the dashboard loads with lazy(() => import(...)).
    expect(keys.has('Show cache hit rate for')).toBe(true)
  })

  test('leaves out keys only other pages name', () => {
    // The channels page's high-risk retry dialog.
    expect(keys.has('I confirm enabling high-risk retry')).toBe(false)
  })

  test('keeps keys no console source names, which the server may send', () => {
    const named = 'Successfully created {{count}} API Key(s)'
    const unnamed = 'A message only the server sends'
    const locale = { translation: { [named]: '已创建', [unnamed]: '仅服务端' } }
    expect([...coreKeys(locale.translation)].sort()).toEqual(
      [named, unnamed].sort()
    )
  })
})
