type Locale = { translation: Record<string, string> }

export function coreKeys(translation: Record<string, string>): Set<string>
export function splitLocale<T extends Locale>(
  locale: T,
  part: 'core' | 'rest',
  keys: Set<string>
): T
export default function i18nLocaleSplitLoader(
  this: { resourceQuery: string; mode: string },
  source: string
): string
