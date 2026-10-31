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
 * CoreCode fork: the cache hit rate over the page's time range, one bar per
 * time bucket, with the change against the period just before it. Bars are
 * plain elements like the overview's spend trend, so each carries its own
 * accessible label and follows the theme tokens.
 */
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { DEFAULT_TIME_GRANULARITY } from '@/features/dashboard/constants'
import { buildQueryParams, getDefaultDays } from '@/features/dashboard/lib'
import {
  ALL_MODELS,
  buildCachePrices,
  estimateCacheSavings,
  getCacheHitRate,
  getSeriesUsage,
  summarizeCacheHitRate,
} from '@/features/dashboard/lib/cache-hit-rate'
import { getDashboardChartColors } from '@/features/dashboard/lib/charts'
import type {
  DashboardFilters,
  QuotaDataItem,
} from '@/features/dashboard/types'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { toIntlLocale } from '@/i18n/languages'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange, formatChartTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { PanelWrapper } from '../ui/panel-wrapper'
import { CacheStats } from './cache-stats'

const GRID_STEPS = [1, 0.75, 0.5, 0.25, 0]
const MAX_AXIS_LABELS = 8

interface CacheHitRateChartProps {
  data: QuotaDataItem[]
  loading: boolean
  filters: DashboardFilters
}

export function CacheHitRateChart(props: CacheHitRateChartProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const [series, setSeries] = useState(ALL_MODELS)
  const granularity = props.filters.time_granularity || DEFAULT_TIME_GRANULARITY

  // The same range LogStatCards loads `data` for, so both describe one period.
  const range = useMemo(() => {
    const timeRange = computeTimeRange(
      getDefaultDays(props.filters.time_granularity),
      props.filters.start_timestamp,
      props.filters.end_timestamp
    )
    return {
      start: timeRange.start_timestamp,
      end: Math.min(timeRange.end_timestamp, Math.floor(Date.now() / 1000)),
      queryEnd: timeRange.end_timestamp,
    }
  }, [props.filters])

  const previousStart = range.start - (range.queryEnd - range.start)
  const previousQuery = useQuery({
    queryKey: [
      'dashboard',
      'models',
      'cache-hit-rate-previous',
      previousStart,
      range.start,
      props.filters.username,
      isAdmin,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates(
          buildQueryParams(
            { start_timestamp: previousStart, end_timestamp: range.start - 1 },
            props.filters
          ),
          isAdmin
        )
      ).data ?? [],
    staleTime: 60 * 1000,
    meta: { errorToast: false },
  })

  const summary = useMemo(
    () => summarizeCacheHitRate(props.data, range, granularity),
    [props.data, range, granularity]
  )
  const previous = useMemo(
    () =>
      summarizeCacheHitRate(
        previousQuery.data ?? [],
        { start: previousStart, end: range.start },
        granularity
      ),
    [previousQuery.data, previousStart, range.start, granularity]
  )

  const pricing = usePricingData()
  const prices = useMemo(
    () =>
      buildCachePrices(pricing.models, pricing.groupRatio, pricing.autoGroups),
    [pricing.models, pricing.groupRatio, pricing.autoGroups]
  )

  const activeSeries =
    series === ALL_MODELS || summary.models.includes(series)
      ? series
      : ALL_MODELS
  const colors = getDashboardChartColors(summary.models.length + 1)
  const seriesColor = (name: string) =>
    name === ALL_MODELS
      ? 'var(--primary)'
      : colors[(summary.models.indexOf(name) + 1) % colors.length]

  const percent = (value: number) =>
    Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value)
  const rate = getCacheHitRate(getSeriesUsage(summary, activeSeries))
  const previousRate = getCacheHitRate(getSeriesUsage(previous, activeSeries))
  const savings = estimateCacheSavings(summary, activeSeries, prices)
  const previousSavings = estimateCacheSavings(previous, activeSeries, prices)
  const labelStep = Math.ceil(summary.buckets.length / MAX_AXIS_LABELS)
  const legend = [
    { name: ALL_MODELS, label: t('All models') },
    ...summary.models.map((model) => ({ name: model, label: model })),
  ]

  return (
    <PanelWrapper
      title={t('Cache hit rate')}
      description={t(
        'Cache reads ÷ (reads + writes), for models that report cache usage'
      )}
      loading={props.loading}
      empty={!props.loading && summary.models.length === 0}
      emptyMessage={t('No cache data in this period yet')}
      height='h-64'
    >
      <CacheStats
        rate={rate}
        previousRate={previousRate}
        savings={pricing.isLoading || pricing.error ? null : savings}
        previousSavings={previousSavings}
      />
      <div className='flex h-64 gap-2'>
        <div
          className='text-muted-foreground flex flex-col justify-between pb-5 text-right text-[10px] tabular-nums'
          aria-hidden
        >
          {GRID_STEPS.map((step) => (
            <span
              key={step}
              className='-translate-y-1/2 first:translate-y-0 last:translate-y-0'
            >
              {percent(step)}
            </span>
          ))}
        </div>
        <div className='relative flex min-w-0 flex-1 flex-col'>
          <div className='pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between'>
            {GRID_STEPS.map((step) => (
              <span
                key={step}
                className={cn(
                  'border-border w-full border-t',
                  step > 0 && 'border-dashed'
                )}
              />
            ))}
          </div>
          {/* Spacing sits inside each bar's trigger, so every pixel across
              the chart opens a bucket, and the provider opens it without a
              delay. */}
          <TooltipProvider delay={0}>
            <ol
              className='relative flex flex-1 items-end'
              aria-label={t('Cache hit rate')}
            >
              {summary.buckets.map((bucket, index) => {
                const label = formatChartTime(bucket.start, granularity)
                const bucketRate = getCacheHitRate(
                  getSeriesUsage(bucket, activeSeries)
                )
                const barLabel =
                  bucketRate === null
                    ? t('{{date}}: no cache data', { date: label })
                    : t('{{date}}: {{rate}} cache hit', {
                        date: label,
                        rate: percent(bucketRate),
                      })
                return (
                  <li
                    key={bucket.start}
                    className='flex h-full min-w-0 flex-1 flex-col'
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div
                            tabIndex={0}
                            aria-label={barLabel}
                            className={cn(
                              'group/bar focus-visible:ring-ring/50 flex flex-1 items-end rounded-sm outline-none focus-visible:ring-3',
                              summary.buckets.length > 48
                                ? 'px-[0.5px]'
                                : 'px-[3px]'
                            )}
                          />
                        }
                      >
                        <span
                          className={cn(
                            'w-full rounded-t-[3px] opacity-80 transition-[height,opacity] duration-300 ease-out group-hover/bar:opacity-100',
                            bucketRate === null ? 'h-0' : 'min-h-1'
                          )}
                          style={{
                            height: `${(bucketRate ?? 0) * 100}%`,
                            backgroundColor: seriesColor(activeSeries),
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{barLabel}</TooltipContent>
                    </Tooltip>
                    {/* Centred under the bar and allowed past its width, since
                      an hourly label is wider than an hourly bar. A phone
                      shows every other one. */}
                    <span className='relative mt-1.5 h-3.5' aria-hidden>
                      {index % labelStep === 0 && (
                        <span
                          className={cn(
                            'text-muted-foreground absolute left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap tabular-nums',
                            index % (labelStep * 2) !== 0 && 'max-sm:hidden'
                          )}
                        >
                          {label}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ol>
          </TooltipProvider>
        </div>
      </div>
      <ToggleGroup
        value={[activeSeries]}
        onValueChange={(values) => {
          const next = values.find((value) => value !== activeSeries)
          if (next) setSeries(next)
        }}
        aria-label={t('Show cache hit rate for')}
        size='sm'
        spacing={1}
        className='mt-4 flex-wrap'
      >
        {legend.map((item) => {
          const itemRate = getCacheHitRate(getSeriesUsage(summary, item.name))
          return (
            <ToggleGroupItem
              key={item.name}
              value={item.name}
              className='gap-1.5 text-xs'
            >
              <span
                className='size-2.5 rounded-[3px]'
                style={{ backgroundColor: seriesColor(item.name) }}
                aria-hidden
              />
              <span>{item.label}</span>
              <span className='tabular-nums'>
                {itemRate === null ? '—' : percent(itemRate)}
              </span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </PanelWrapper>
  )
}
