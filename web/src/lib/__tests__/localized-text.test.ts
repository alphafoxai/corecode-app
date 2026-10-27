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
  localizeItem,
  resolveLocalizedOption,
  resolveLocalizedText,
  type LocalizedTextValue,
} from '../localized-text'

type ResolveCase = {
  name: string
  value: LocalizedTextValue | null | undefined
  language: string
  expected: string
}

const KLING = {
  en: 'Video generation via Kling API',
  zh: '可灵视频生成',
  'zh-TW': '可靈影片生成',
} as const

describe('resolveLocalizedText', () => {
  test.each<ResolveCase>([
    {
      name: 'returns a bare string unchanged so legacy marketplace indexes still render',
      value: 'Video generation via Kling API',
      language: 'zhCN',
      expected: 'Video generation via Kling API',
    },
    {
      name: 'returns the exact BCP-47 tag when the map contains zh-TW',
      value: KLING,
      language: 'zh-TW',
      expected: '可靈影片生成',
    },
    {
      name: 'matches zh-TW case-insensitively when i18next language is zh-tw',
      value: KLING,
      language: 'zh-tw',
      expected: '可靈影片生成',
    },
    {
      name: 'maps the project i18next code zhTW onto the zh-TW map key',
      value: KLING,
      language: 'zhTW',
      expected: '可靈影片生成',
    },
    {
      name: 'falls back from zh-TW to the zh primary subtag when zh-TW is absent',
      value: { en: KLING.en, zh: KLING.zh },
      language: 'zh-TW',
      expected: '可灵视频生成',
    },
    {
      name: 'maps the project i18next code zhCN onto the zh primary subtag',
      value: { en: KLING.en, zh: KLING.zh },
      language: 'zhCN',
      expected: '可灵视频生成',
    },
    {
      name: 'falls back from en-US to en when only the primary tag exists',
      value: { en: KLING.en, zh: KLING.zh },
      language: 'en-US',
      expected: 'Video generation via Kling API',
    },
    {
      name: 'falls back to en when the requested language and its primary tag are absent',
      value: { en: KLING.en, ja: 'Kling で動画生成' },
      language: 'fr',
      expected: 'Video generation via Kling API',
    },
    {
      name: 'uses the first sorted key when en and the requested language are both absent',
      value: { ja: 'Kling で動画生成', fr: 'Génération vidéo Kling' },
      language: 'ru',
      expected: 'Génération vidéo Kling',
    },
    {
      name: 'returns an empty string when the value is null',
      value: null,
      language: 'en',
      expected: '',
    },
    {
      name: 'returns an empty string when the value is undefined',
      value: undefined,
      language: 'en',
      expected: '',
    },
    {
      name: 'returns an empty string when the map has no usable entries',
      value: {},
      language: 'zhCN',
      expected: '',
    },
  ])('$name', ({ value, language, expected }) => {
    expect(resolveLocalizedText(value, language)).toBe(expected)
  })
})

type OptionCase = {
  name: string
  value: string | null | undefined
  language: string
  expected: string
}

describe('resolveLocalizedOption', () => {
  const bilingual = JSON.stringify({ zh: '<p>中文</p>', en: '<p>English</p>' })

  test.each<OptionCase>([
    {
      name: 'picks the Chinese text for the zhCN console language',
      value: bilingual,
      language: 'zhCN',
      expected: '<p>中文</p>',
    },
    {
      name: 'falls back to English for a language the option does not carry',
      value: bilingual,
      language: 'fr',
      expected: '<p>English</p>',
    },
    {
      name: 'returns plain HTML unchanged',
      value: '<p>只有中文</p>',
      language: 'en',
      expected: '<p>只有中文</p>',
    },
    {
      name: 'returns a URL unchanged so the home page still embeds it',
      value: 'https://corecode.live/home',
      language: 'en',
      expected: 'https://corecode.live/home',
    },
    {
      name: 'returns JSON with a non-string value unchanged',
      value: '{"zh":"中文","count":2}',
      language: 'en',
      expected: '{"zh":"中文","count":2}',
    },
    {
      name: 'returns text that only looks like JSON unchanged',
      value: '{ not json',
      language: 'en',
      expected: '{ not json',
    },
    {
      name: 'returns an empty string when the option is unset',
      value: undefined,
      language: 'en',
      expected: '',
    },
  ])('$name', ({ value, language, expected }) => {
    expect(resolveLocalizedOption(value, language)).toBe(expected)
  })
})

describe('localizeItem', () => {
  const faq = {
    id: 1,
    question: '支持哪些模型？',
    answer: '全部 Claude 模型。',
    i18n: {
      zh: { question: '支持哪些模型？', answer: '全部 Claude 模型。' },
      en: { question: 'Which models?', answer: 'Every Claude model.' },
    },
  }

  test('overlays the English fields for an English console', () => {
    expect(localizeItem(faq, 'en')).toMatchObject({
      id: 1,
      question: 'Which models?',
      answer: 'Every Claude model.',
    })
  })

  test('keeps the base fields a translation leaves out or blanks', () => {
    const item = { title: '标题', body: '正文', i18n: { en: { title: '' } } }
    expect(localizeItem(item, 'en')).toMatchObject({
      title: '标题',
      body: '正文',
    })
  })

  test('returns the item itself when it carries no translations', () => {
    const item = { question: '问题', answer: '回答' }
    expect(localizeItem(item, 'en')).toBe(item)
  })

  test('does not mutate the source item', () => {
    localizeItem(faq, 'en')
    expect(faq.question).toBe('支持哪些模型？')
  })
})
