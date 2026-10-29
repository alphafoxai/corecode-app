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
type LocaleLoader = {
  core: () => Promise<LocaleModule>
  rest?: () => Promise<LocaleModule>
}

// Each locale is 0.5–0.8 MB and a visitor reads one, so each loads as its own
// chunk on demand instead of all seven riding in the entry bundle. Every locale
// carries every key (locales.test.ts), so a supported language loads alone and
// `en` is the fallback only for a language the console does not offer. English
// loads only the entries that differ from their keys
// (scripts/i18n-en-overrides-loader.cjs); the rest render as the key itself.
//
// The other languages load in two parts (scripts/i18n-locale-split-loader.mjs):
// `core` has every key the pages in core-routes.ts can show, and the first
// render waits only for it; `rest` has the keys only other pages name, and
// loads after that render or before another page renders (loadRestLocale).
// The chunk names let index.html preload the visitor's locale beside the entry
// bundle, and its rest when the page is not a core one (pluginPreloadLocale in
// rsbuild.config.ts).
const localeLoaders: Record<string, LocaleLoader> = {
  en: {
    core: () =>
      import(/* webpackChunkName: "locale-en" */ './locales/en.json?overrides'),
  },
  zhCN: {
    core: () =>
      import(/* webpackChunkName: "locale-zhCN" */ './locales/zh.json?core'),
    rest: () =>
      import(/* webpackChunkName: "i18n-rest-zhCN" */ './locales/zh.json?rest'),
  },
  fr: {
    core: () =>
      import(/* webpackChunkName: "locale-fr" */ './locales/fr.json?core'),
    rest: () =>
      import(/* webpackChunkName: "i18n-rest-fr" */ './locales/fr.json?rest'),
  },
  ru: {
    core: () =>
      import(/* webpackChunkName: "locale-ru" */ './locales/ru.json?core'),
    rest: () =>
      import(/* webpackChunkName: "i18n-rest-ru" */ './locales/ru.json?rest'),
  },
  ja: {
    core: () =>
      import(/* webpackChunkName: "locale-ja" */ './locales/ja.json?core'),
    rest: () =>
      import(/* webpackChunkName: "i18n-rest-ja" */ './locales/ja.json?rest'),
  },
  vi: {
    core: () =>
      import(/* webpackChunkName: "locale-vi" */ './locales/vi.json?core'),
    rest: () =>
      import(/* webpackChunkName: "i18n-rest-vi" */ './locales/vi.json?rest'),
  },
  zhTW: {
    core: () =>
      import(/* webpackChunkName: "locale-zhTW" */ './locales/zh-TW.json?core'),
    rest: () =>
      import(
        /* webpackChunkName: "i18n-rest-zhTW" */ './locales/zh-TW.json?rest'
      ),
  },
}

// Languages whose rest part is loaded, or loading.
const restLoads = new Map<string, Promise<void>>()
let firstRead = true

// i18next awaits `read` when it takes two parameters and returns a promise.
// The page load's first language reads its core part; a language the visitor
// switches to later reads whole, so the page on screen never lacks a key.
const lazyLocales: BackendModule = {
  type: 'backend',
  init: () => undefined,
  async read(language: string, _namespace: string) {
    const loader = localeLoaders[language]
    if (!loader) return {}
    if (firstRead || !loader.rest) {
      firstRead = false
      return (await loader.core()).default.translation
    }
    const [core, rest] = await Promise.all([loader.core(), loader.rest()])
    restLoads.set(language, Promise.resolve())
    return { ...core.default.translation, ...rest.default.translation }
  },
}

/**
 * Load the rest of a language's locale, the keys only non-core pages name.
 * Resolves once they are in, or once loading failed; the next call retries,
 * and until then those keys render as their English source text.
 */
export function loadRestLocale(
  language: string = i18n.resolvedLanguage ?? i18n.language
): Promise<void> {
  const rest = localeLoaders[language]?.rest
  if (!rest) return Promise.resolve()
  let pending = restLoads.get(language)
  if (!pending) {
    pending = rest().then(
      (locale) => {
        i18n.addResourceBundle(
          language,
          'translation',
          locale.default.translation,
          true,
          false
        )
      },
      () => {
        restLoads.delete(language)
      }
    )
    restLoads.set(language, pending)
  }
  return pending
}

// <html lang> follows the interface language, for screen readers, browser
// translation and search engines. index.html's value covers the first paint.
i18n.on('languageChanged', (language) => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = toIntlLocale(language) ?? 'en'
})

// Resolves once the current language is loaded, or has failed to load; keys
// then render as their English source text.
export const i18nReady = i18n
  .use(lazyLocales)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: {
      default: ['en'],
      ...Object.fromEntries(Object.keys(localeLoaders).map((lng) => [lng, []])),
    },
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
