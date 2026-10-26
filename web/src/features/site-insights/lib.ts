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

import type { InsightsView } from './api'

export const INSIGHTS_VIEWS: InsightsView[] = [
  'capacity',
  'finance',
  'risk',
  'growth',
  'activity',
  'quality',
  'business',
]

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
    cny: (value: number) => formatPaymentMoney(value),
    pct: (value: number) => percent.format(value),
    day: (unix: number) => day.format(new Date(unix * 1000)),
    time: (unix: number) => (unix ? hour.format(new Date(unix * 1000)) : '-'),
    ms: (value: number) =>
      value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`,
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
