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
import i18n, { type BackendModule } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { convertDetectedLanguage, toIntlLocale } from './languages'

type LocaleModule = { default: { translation: Record<string, string> } }

// Each locale is 0.5–0.8 MB and a visitor reads one, so each loads as its own
// chunk on demand instead of all seven riding in the entry bundle. i18next
// requests the current language and the `en` fallback.
const localeLoaders: Record<string, () => Promise<LocaleModule>> = {
  en: () => import('./locales/en.json'),
  zhCN: () => import('./locales/zh.json'),
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
  zhTW: () => import('./locales/zh-TW.json'),
}

// i18next awaits `read` when it takes two parameters and returns a promise.
const lazyLocales: BackendModule = {
  type: 'backend',
  init: () => undefined,
  async read(language: string, _namespace: string) {
    const load = localeLoaders[language]
    return load ? (await load()).default.translation : {}
  },
}

// <html lang> follows the interface language, for screen readers, browser
// translation and search engines. index.html's value covers the first paint.
i18n.on('languageChanged', (language) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = toIntlLocale(language) ?? 'en'
})

// Resolves once the current language and the fallback are loaded, or have
// failed to load; keys then render as their English source text.
export const i18nReady = i18n
  .use(lazyLocales)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: Object.keys(localeLoaders),
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

export default i18n
