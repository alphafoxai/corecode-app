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

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { estimateRunwayDays, type DailySpend } from '../lib/customer-overview'

/** Days of spend the runway estimate averages over. */
const RUNWAY_WINDOW_DAYS = 7
const LOW_RUNWAY_DAYS = 3

export type BalanceHealth = 'healthy' | 'low' | 'empty'

const HEALTH: Record<
  BalanceHealth,
  { dotClassName: string; labelKey: string }
> = {
  healthy: { dotClassName: 'bg-success', labelKey: 'Healthy' },
  low: { dotClassName: 'bg-warning', labelKey: 'Low balance' },
  empty: { dotClassName: 'bg-destructive', labelKey: 'Balance depleted' },
}

/**
 * How healthy a balance is and how long it lasts at the last week's spend.
 * The overview and the wallet word it the same way.
 */
export function useBalanceStatus(balance: number, daily: DailySpend[]) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const runway = estimateRunwayDays(balance, daily.slice(-RUNWAY_WINDOW_DAYS))

  let health: BalanceHealth = 'healthy'
  if (balance <= 0) health = 'empty'
  else if (runway !== null && runway < LOW_RUNWAY_DAYS) health = 'low'

  let runwayText = t('Runway appears after your first requests')
  if (runway !== null) {
    runwayText =
      runway >= 365
        ? t('Lasts over a year at your recent daily spend')
        : t('About {{days}} days at your recent daily spend', {
            days: formatNumber(Math.max(1, Math.floor(runway)), locale),
          })
  }

  return {
    health,
    runwayDays: runway,
    dotClassName: HEALTH[health].dotClassName,
    label: t(HEALTH[health].labelKey),
    runwayText,
  }
}
