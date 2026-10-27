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

/**
 * Plugin / marketplace copy that may be a bare string (legacy marketplace
 * index) or a BCP-47 map. Gateway APIs always emit the map form.
 */
export type LocalizedTextValue = string | Record<string, string>

/**
 * Resolve LocalizedText against an i18next language code.
 *
 * This project's `i18n.language` values are `en` / `zhCN` / `zhTW` / `fr` /
 * `ru` / `ja` / `vi` (see `web/src/i18n/config.ts`). Backend keys are BCP-47
 * (`en`, `zh`, `zh-TW`). Matching is case-insensitive and also accepts
 * hyphenated tags (`zh-TW`, `en-US`) so callers can pass either shape.
 *
 * Fallback: exact tag → primary subtag → `en` → first key in sorted order → `''`.
 */
export function resolveLocalizedText(
  value: LocalizedTextValue | undefined | null,
  language: string
): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (!isPlainObject(value)) return ''
  return (
    pickLocale(
      value,
      language,
      (text): text is string => typeof text === 'string' && text.trim() !== ''
    ) ?? ''
  )
}

/**
 * Resolve a system option that holds either plain text or a JSON object of
 * locale → text (`{"zh":"…","en":"…"}`), such as `HomePageContent` and
 * `Footer`. Anything that is not such an object, including JSON of another
 * shape, is returned unchanged so existing plain values keep rendering.
 */
export function resolveLocalizedOption(
  value: string | undefined | null,
  language: string
): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return value
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return value
  }
  if (!isPlainObject(parsed)) return value
  const entries = Object.values(parsed)
  if (entries.length === 0 || entries.some((text) => typeof text !== 'string'))
    return value
  return resolveLocalizedText(parsed as Record<string, string>, language)
}

/**
 * Overlay the string fields of an item's optional `i18n` translation
 * (`{"en": {"answer": "…"}}`) that best matches `language` onto the item.
 * Items without translations are returned as they are.
 */
export function localizeItem<T extends object>(item: T, language: string): T {
  const translations = (item as { i18n?: unknown }).i18n
  if (!isPlainObject(translations)) return item
  const fields = pickLocale(translations, language, isPlainObject)
  if (!fields) return item
  const localized: Record<string, unknown> = {
    ...(item as Record<string, unknown>),
  }
  for (const [field, text] of Object.entries(fields)) {
    if (typeof text === 'string' && text.trim() !== '') localized[field] = text
  }
  return localized as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fallback: exact tag → primary subtag → `en` → first key in sorted order.
 */
function pickLocale<V>(
  value: Record<string, unknown>,
  language: string,
  accept: (entry: unknown) => entry is V
): V | undefined {
  const entries = new Map<string, V>()
  for (const [key, entry] of Object.entries(value)) {
    if (!accept(entry)) continue
    const locale = key.trim().replaceAll('_', '-').toLowerCase()
    if (!locale) continue
    entries.set(locale, entry)
  }
  if (entries.size === 0) return undefined

  for (const candidate of localeFallbackKeys(language)) {
    const hit = entries.get(candidate)
    if (hit !== undefined) return hit
  }

  const firstKey = [...entries.keys()].sort((left, right) =>
    left.localeCompare(right)
  )[0]
  return firstKey ? entries.get(firstKey) : undefined
}

function localeFallbackKeys(language: string): string[] {
  const normalized = language.trim().replaceAll('_', '-').toLowerCase()
  const keys: string[] = []
  const add = (tag: string) => {
    if (tag && !keys.includes(tag)) keys.push(tag)
  }

  add(normalized)
  if (normalized === 'zhcn') add('zh-cn')
  if (normalized === 'zhtw') add('zh-tw')

  if (normalized.includes('-')) {
    add(normalized.slice(0, normalized.indexOf('-')))
  } else if (normalized === 'zhcn' || normalized === 'zhtw') {
    add('zh')
  }
  add('en')
  return keys
}
