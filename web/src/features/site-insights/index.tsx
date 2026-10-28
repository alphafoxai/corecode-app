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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { getInsights, VIEW_MAX_DAYS, type InsightsView } from './api'
import { CapacityTab } from './components/capacity-tab'
import { FinanceTab } from './components/finance-tab'
import { ActivityTab, GrowthTab } from './components/growth-tab'
import { PoolTab } from './components/pool-tab'
import { BusinessTab, QualityTab } from './components/quality-tab'
import { RiskTab } from './components/risk-tab'
import { INSIGHTS_PRESETS, INSIGHTS_VIEWS } from './lib'

const route = getRouteApi('/_authenticated/site-insights/')

// The capacity view carries live in-flight counts; the pool is all live.
const REFRESH_MS: Partial<Record<InsightsView, number>> = {
  capacity: 30_000,
  pool: 15_000,
}

/**
 * The root-only site dashboard. Each tab reads one /api/site-insights view
 * over the chosen number of days, clamped to what that view accepts.
 */
export function SiteInsights() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const view = search.tab ?? 'capacity'
  const days = Math.min(search.days ?? 7, VIEW_MAX_DAYS[view])
  // The end is fixed when the page or range changes, so cached results do
  // not refetch on every render; Refresh moves it to now.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  const queryClient = useQueryClient()
  const insightsQuery = (tab: InsightsView) => {
    const tabRange = {
      start_time: now - Math.min(search.days ?? 7, VIEW_MAX_DAYS[tab]) * 86400,
      end_time: now,
    }
    return {
      queryKey: ['site-insights', tab, tabRange],
      queryFn: () => getInsights(tab, tabRange),
      // A tab prefetched on hover is still fresh when it opens.
      staleTime: 30_000,
    }
  }
  const query = useQuery({
    ...insightsQuery(view),
    refetchInterval: REFRESH_MS[view] ?? false,
    // A new range keeps the old figures on screen until its own arrive. Only
    // the same tab's data fits its component, so another tab starts empty.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === view ? previous : undefined,
  })
  const prefetch = (tab: InsightsView) => {
    if (tab !== view) void queryClient.prefetchQuery(insightsQuery(tab))
  }

  const tabLabels: Record<InsightsView, string> = {
    capacity: t('Capacity'),
    finance: t('Funds'),
    risk: t('Risk'),
    growth: t('Growth'),
    activity: t('Activity'),
    quality: t('Quality'),
    business: t('Business'),
    pool: t('Account pool'),
  }
  const presetLabel = (preset: number) =>
    preset === 1 ? t('24 hours') : t('{{count}} days', { count: preset })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Site Insights')}</span>
          <Badge variant='outline' className='shrink-0'>
            Root
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='grid gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Tabs
              value={view}
              onValueChange={(value) =>
                navigate({
                  search: (prev) => ({ ...prev, tab: value as InsightsView }),
                })
              }
            >
              <TabsList className='flex-wrap'>
                {INSIGHTS_VIEWS.map((item) => (
                  <TabsTrigger
                    key={item}
                    value={item}
                    onPointerEnter={() => prefetch(item)}
                    onFocus={() => prefetch(item)}
                  >
                    {tabLabels[item]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className='flex items-center gap-2'>
              {view !== 'pool' && (
                <ToggleGroup
                  variant='outline'
                  size='sm'
                  value={[String(days)]}
                  onValueChange={(value: string[]) => {
                    const next = Number(value.at(-1))
                    if (next) {
                      navigate({ search: (prev) => ({ ...prev, days: next }) })
                    }
                  }}
                >
                  {INSIGHTS_PRESETS.filter(
                    (preset) => preset <= VIEW_MAX_DAYS[view]
                  ).map((preset) => (
                    <ToggleGroupItem key={preset} value={String(preset)}>
                      {presetLabel(preset)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
              <Button
                variant='outline'
                size='icon-sm'
                aria-label={t('Refresh')}
                onClick={() => setNow(Math.floor(Date.now() / 1000))}
                disabled={query.isFetching}
              >
                <RefreshCw
                  className={query.isFetching ? 'animate-spin' : undefined}
                />
              </Button>
            </div>
          </div>
          {query.isError && (
            <p className='text-destructive text-sm'>
              {query.error instanceof Error
                ? query.error.message
                : t('Failed to load site insights')}
            </p>
          )}
          <InsightsView view={view} data={query.data} />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function InsightsView(props: { view: InsightsView; data: unknown }) {
  // Each query key includes the view, so data always matches it.
  switch (props.view) {
    case 'capacity':
      return <CapacityTab data={props.data as never} />
    case 'finance':
      return <FinanceTab data={props.data as never} />
    case 'risk':
      return <RiskTab data={props.data as never} />
    case 'growth':
      return <GrowthTab data={props.data as never} />
    case 'activity':
      return <ActivityTab data={props.data as never} />
    case 'quality':
      return <QualityTab data={props.data as never} />
    case 'business':
      return <BusinessTab data={props.data as never} />
    case 'pool':
      return <PoolTab data={props.data as never} />
  }
}
