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
import { createRequire } from 'node:module'

import { createInstance } from 'i18next'
import { expect, it } from 'vitest'

import en from './locales/en.json'
import zh from './locales/zh.json'

const require = createRequire(import.meta.url)
const { pruneSourceText } =
  require('../../scripts/i18n-en-overrides-loader.cjs') as {
    pruneSourceText: (locale: typeof en) => typeof en
  }

async function translator(lng: string, english: typeof en) {
  const i18n = createInstance()
  await i18n.init({
    lng,
    fallbackLng: 'en',
    nsSeparator: false,
    interpolation: { escapeValue: false },
    resources: { en: english, zhCN: zh },
  })
  return i18n.t
}

it('renders every key the same with only the English overrides', async () => {
  const slim = pruneSourceText(en)
  expect(Object.keys(slim.translation).length).toBeLessThan(
    Object.keys(en.translation).length / 10
  )
  for (const lng of ['en', 'zhCN']) {
    const full = await translator(lng, en)
    const pruned = await translator(lng, slim)
    for (const key of Object.keys(en.translation)) {
      expect(pruned(key), `${lng}: ${key}`).toBe(full(key))
    }
  }
})
