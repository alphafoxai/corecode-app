type Locale = { translation: Record<string, string> }
type LocalePart = 'boot' | 'core' | 'rest'

export function localeParts(
  translation: Record<string, string>
): Map<string, LocalePart>
export function splitLocale<T extends Locale>(
  locale: T,
  part: LocalePart,
  parts: Map<string, LocalePart>
): T
export default function i18nLocaleSplitLoader(
  this: { resourceQuery: string; mode: string },
  source: string
): string
