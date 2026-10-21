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
 * CoreCode fork: fourteen daily bars are plain elements rather than a VChart
 * instance. The chart has no axes to configure, follows the theme tokens
 * without a chart theme, and each bar carries its own accessible label.
 */
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { DailySpend } from '../../lib/customer-overview'
import { PanelWrapper } from '../ui/panel-wrapper'

export function SpendTrendPanel(props: {
  daily: DailySpend[]
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const max = Math.max(0, ...props.daily.map((day) => day.quota))
  const total = props.daily.reduce((sum, day) => sum + day.quota, 0)
  const dayFormat = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
  })
  const lastIndex = props.daily.length - 1

  return (
    <PanelWrapper
      title={t('Spend, last 14 days')}
      description={t('{{amount}} in total', { amount: formatQuota(total) })}
      loading={props.loading}
      empty={!props.loading && max === 0}
      emptyMessage={t('Your daily spend shows here after the first request.')}
      height='h-52'
      headerActions={
        <Button
          variant='ghost'
          size='sm'
          render={<Link to='/dashboard/$section' params={{ section: 'models' }} />}
        >
          {t('Details')}
          <ArrowRight data-icon='inline-end' />
        </Button>
      }
    >
      <ol
        className='flex h-52 items-end gap-1.5 px-1'
        aria-label={t('Daily spend')}
      >
        {props.daily.map((day, index) => {
          const label = dayFormat.format(new Date(day.day * 1000))
          const amount = formatQuota(day.quota)
          const requests = formatNumber(day.requests, locale)
          const height = max > 0 ? (day.quota / max) * 100 : 0
          const isToday = index === lastIndex
          return (
            <li key={day.day} className='flex h-full min-w-0 flex-1 flex-col'>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      tabIndex={0}
                      aria-label={t('{{date}}: {{amount}}, {{requests}} requests', {
                        date: label,
                        amount,
                        requests,
                      })}
                      className='group/bar focus-visible:ring-ring/50 flex flex-1 items-end rounded-md outline-none focus-visible:ring-3'
                    />
                  }
                >
                  <span
                    className={cn(
                      'w-full rounded-t-[5px] rounded-b-[2px] transition-[height,background-color] duration-300 ease-out',
                      isToday
                        ? 'bg-primary'
                        : 'bg-primary/30 group-hover/bar:bg-primary/55',
                      day.quota > 0 ? 'min-h-1' : 'bg-border min-h-px'
                    )}
                    style={{ height: `${height}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <div className='flex flex-col gap-0.5 text-xs'>
                    <span className='font-medium'>{label}</span>
                    <span className='tabular-nums'>{amount}</span>
                    <span className='opacity-70'>
                      {t('{{value}} requests', { value: requests })}
                    </span>
                  </div>
                </TooltipContent>
              </Tooltip>
              <span
                className={cn(
                  'text-muted-foreground mt-1.5 truncate text-center text-[10px] tabular-nums',
                  index % 2 === 1 && index !== lastIndex && 'invisible sm:visible',
                  isToday && 'text-foreground font-medium'
                )}
                aria-hidden
              >
                {isToday ? t('Today') : label}
              </span>
            </li>
          )
        })}
      </ol>
    </PanelWrapper>
  )
}
