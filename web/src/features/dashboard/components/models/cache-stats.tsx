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
 * CoreCode fork: the hit rate and estimated net savings above the cache hit
 * rate chart, each against the period just before the page's range.
 */
import { CircleHelp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { CacheSavings } from '@/features/dashboard/lib/cache-hit-rate'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

interface CacheStatsProps {
  rate: number | null
  previousRate: number | null
  /** Null while prices load. */
  savings: CacheSavings | null
  previousSavings: CacheSavings
}

export function CacheStats(props: CacheStatsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const percent = (value: number) =>
    Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value)
  const delta =
    props.rate !== null && props.previousRate !== null
      ? (props.rate - props.previousRate) * 100
      : null
  const netSavings = props.savings
    ? props.savings.saved - props.savings.writePremium
    : 0
  const previousNetSavings =
    props.previousSavings.saved - props.previousSavings.writePremium
  const savingsChange =
    props.savings && previousNetSavings > 0
      ? (netSavings - previousNetSavings) / previousNetSavings
      : null
  const signedPercent = (value: number) =>
    Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    }).format(value)

  return (
    <dl className='mb-5 grid grid-cols-2 gap-4'>
      <div className='flex flex-col gap-1'>
        <dt className='text-muted-foreground text-xs'>{t('Hit rate')}</dt>
        <dd className='text-2xl font-semibold tabular-nums'>
          {props.rate === null ? '—' : percent(props.rate)}
        </dd>
        {delta !== null && (
          <dd
            className={cn(
              'text-xs tabular-nums',
              delta >= 0 ? 'text-success' : 'text-destructive'
            )}
          >
            {t('{{delta}}pp vs previous period', {
              delta: Intl.NumberFormat(locale, {
                maximumFractionDigits: 1,
                signDisplay: 'exceptZero',
              }).format(delta),
            })}
          </dd>
        )}
      </div>
      <div className='flex flex-col gap-1 border-l pl-4'>
        <dt className='text-muted-foreground flex items-center gap-1 text-xs'>
          {t('Net cache savings')}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-xs'
                  aria-label={t('How savings are estimated')}
                />
              }
            >
              <CircleHelp className='size-3.5' aria-hidden />
            </TooltipTrigger>
            <TooltipContent className='max-w-72'>
              {t(
                'Estimated from current prices: what cache reads saved against full input price, minus what cache writes cost above it. Every cache write is priced as a 5-minute write.'
              )}
            </TooltipContent>
          </Tooltip>
        </dt>
        <dd
          className={cn(
            'text-2xl font-semibold tabular-nums',
            netSavings > 0 && 'text-success'
          )}
        >
          {props.savings ? formatQuota(netSavings) : '—'}
        </dd>
        {props.savings && (
          <dd className='text-muted-foreground text-xs tabular-nums'>
            {t('Saved {{saved}} · write premium {{premium}}', {
              saved: formatQuota(props.savings.saved),
              premium: formatQuota(props.savings.writePremium),
            })}
            {savingsChange !== null &&
              ` · ${t('{{change}} vs previous period', {
                change: signedPercent(savingsChange),
              })}`}
            {!props.savings.complete &&
              ` · ${t('Some models have no price and are left out')}`}
          </dd>
        )}
      </div>
    </dl>
  )
}
