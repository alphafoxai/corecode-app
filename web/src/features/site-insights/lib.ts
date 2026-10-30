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
import { useTranslation } from 'react-i18next'

import { formatPaymentMoney } from '@/features/wallet/lib'
import { toIntlLocale } from '@/i18n/languages'
import { useAuthStore } from '@/stores/auth-store'

import type { InsightsView } from './api'
import type { Tone } from './components/shared'
import type { RiskInsights } from './types'

/** A tab of the page: one view, or the overview that reads several. */
export type InsightsTab = 'overview' | InsightsView

/** Tabs in the order shown, grouped by what they answer. */
export const INSIGHTS_TAB_GROUPS: { key: string; tabs: InsightsTab[] }[] = [
  { key: 'overview', tabs: ['overview'] },
  { key: 'operations', tabs: ['capacity', 'pool', 'quality'] },
  { key: 'business', tabs: ['finance', 'growth', 'activity', 'business'] },
  { key: 'risk', tabs: ['risk'] },
]

/** The views the overview reads its signals from. */
export const OVERVIEW_VIEWS = [
  'capacity',
  'pool',
  'quality',
  'finance',
  'risk',
] as const satisfies readonly InsightsView[]

// Thresholds the tabs color by and the overview raises signals at, so a
// signal there always matches a colored figure in its tab.

/** Below this many requests, a model's rates and percentiles are noise. */
export const SMALL_SAMPLE = 100

/** Debt within a dollar is rounding and test traffic; past it, someone owes. */
export const DEBT_ALERT_USD = -1

/** Pool statuses that need an operator, as the engine's own console groups them. */
export const ATTENTION = new Set([
  'reauthorization_required',
  'suspended',
  'blacklisted',
  'quota_observation_unavailable',
])

/** A failure rate above 5% needs action; above 2%, a look. */
export function failureTone(rate: number): Tone {
  if (rate > 0.05) return 'danger'
  if (rate > 0.02) return 'warning'
  return 'default'
}

/**
 * Address clusters without the viewer's own account: the operator's tests
 * from their own machine are not a risk signal. A cluster left with one
 * account is no longer shared.
 */
export function useSharedAddresses(insights: RiskInsights | undefined) {
  const viewer = useAuthStore((state) => state.auth.user?.id)
  return (insights?.shared_ips ?? [])
    .map((cluster) => ({
      ...cluster,
      users: cluster.users.filter((user) => user.user_id !== viewer),
    }))
    .filter((cluster) => cluster.users.length > 1)
}

export const INSIGHTS_PRESETS = [1, 7, 30, 90, 365] as const

export function useInsightsFormat() {
  const { i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const number = new Intl.NumberFormat(locale)
  const usdFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
  const usdWholeFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const usdCompactFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  const compactFormat = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  const multipleFormat = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  })
  const day = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
  })
  const hour = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return {
    num: (value: number) => number.format(value),
    usd: (value: number) => usdFormat.format(value),
    usdWhole: (value: number) => usdWholeFormat.format(Math.round(value)),
    cny: (value: number) => formatPaymentMoney(value),
    /** Short forms for chart axes and bar labels. */
    usdCompact: (value: number) => usdCompactFormat.format(value),
    cnyCompact: (value: number) => `¥${compactFormat.format(value)}`,
    pct: (value: number) => percent.format(value),
    /** A price multiple, such as 1.95×. */
    multiple: (value: number) => `${multipleFormat.format(value)}×`,
    day: (unix: number) => day.format(new Date(unix * 1000)),
    time: (unix: number) => (unix ? hour.format(new Date(unix * 1000)) : '-'),
    ms: (value: number) =>
      value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`,
    /** A duration that is 0 only when nothing was measured. */
    measuredMs: (value: number) => {
      if (value <= 0) return '—'
      return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`
    },
  }
}

export function useErrorCategoryLabel() {
  const { t } = useTranslation()
  return (name: string) =>
    ({
      engine_concurrency: t('Engine account concurrency full'),
      upstream_rate_limit: t('Claude upstream rate limit'),
      upstream_overloaded: t('Claude upstream overloaded'),
      upstream_error: t('Upstream error'),
      client_error: t('Client error'),
      other: t('Other'),
    })[name] ?? name
}

export function useSignupMethodLabel() {
  const { t } = useTranslation()
  return (name: string) =>
    ({
      oidc: t('Google'),
      linuxdo: 'LinuxDO',
      github: 'GitHub',
      discord: 'Discord',
      telegram: 'Telegram',
      wechat: t('WeChat'),
      email: t('Email link'),
      password: t('Password'),
      all: t('All'),
      organic: t('Organic'),
      invited: t('Invited'),
    })[name] ?? name
}
