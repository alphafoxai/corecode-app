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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { useInsightsFormat } from '../lib'
import type { NamedCount } from '../types'

export function Panel(props: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card data-card-hover='false' className={cn('gap-0 py-0', props.className)}>
      <div className='flex items-start justify-between gap-2 border-b px-4 py-3'>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold'>{props.title}</h3>
          {props.description != null && (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {props.description}
            </p>
          )}
        </div>
        {props.actions}
      </div>
      <CardContent className='p-4'>{props.children}</CardContent>
    </Card>
  )
}

export type MetricItem = {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'warning' | 'danger' | 'good'
}

const TONES = {
  default: '',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
  good: 'text-emerald-600 dark:text-emerald-400',
}

export function MetricGrid(props: { items: MetricItem[]; loading?: boolean }) {
  return (
    <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
      {props.items.map((item) => (
        <Card
          key={item.label}
          data-card-hover='false'
          className='bg-muted/20 gap-1 px-3 py-2.5'
        >
          <dt className='text-muted-foreground truncate text-xs'>
            {item.label}
          </dt>
          <dd
            className={cn(
              'truncate text-lg font-semibold tabular-nums',
              TONES[item.tone ?? 'default']
            )}
          >
            {props.loading ? <Skeleton className='h-7 w-16' /> : item.value}
          </dd>
          {item.hint != null && (
            <dd className='text-muted-foreground truncate text-xs'>
              {item.hint}
            </dd>
          )}
        </Card>
      ))}
    </dl>
  )
}

export type BarPoint = {
  key: string | number
  /** The date or hour, shown atop the tooltip and on the axis. */
  title: string
  /** Stacked segments, bottom first, one per series. */
  values: number[]
  /** Further figures listed in the tooltip below the series. */
  extra?: { label: string; value: string }[]
}

export type BarSeriesItem = {
  label: string
  format?: (value: number) => string
}

const SEGMENT_COLORS = [
  'bg-primary/60 group-hover/bar:bg-primary group-focus-visible/bar:bg-primary',
  'bg-sky-500/60 group-hover/bar:bg-sky-500 group-focus-visible/bar:bg-sky-500',
  'bg-amber-500/60 group-hover/bar:bg-amber-500 group-focus-visible/bar:bg-amber-500',
  'bg-rose-500/60 group-hover/bar:bg-rose-500 group-focus-visible/bar:bg-rose-500',
]

const DOT_COLORS = ['bg-primary', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500']

/**
 * A bar per point with a value axis and the first and last titles below.
 * Hovering or focusing a bar shows each series' value; the tooltip opens
 * at once and follows the pointer from bar to bar.
 */
export function BarSeries(props: {
  points: BarPoint[]
  series: BarSeriesItem[]
  className?: string
  ariaLabel: string
}) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const formatOf = (index: number) =>
    props.series[index]?.format ?? props.series[0]?.format ?? fmt.num
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
  const max = Math.max(0, ...props.points.map((point) => sum(point.values)))
  const stacked = props.series.length > 1
  const first = props.points.at(0)
  const last = props.points.at(-1)
  return (
    <div className={cn('grid gap-2', props.className)}>
      <div className='grid grid-cols-[auto_1fr] gap-2'>
        <div
          aria-hidden
          className='text-muted-foreground flex h-40 flex-col justify-between text-right text-[10px] tabular-nums'
        >
          <span className='-translate-y-1/2'>{formatOf(0)(max)}</span>
          <span className='translate-y-1/2'>{formatOf(0)(0)}</span>
        </div>
        <TooltipProvider delay={0}>
          <ol
            className='border-border/60 flex h-40 items-end gap-px border-t border-dashed sm:gap-0.5'
            aria-label={props.ariaLabel}
          >
            {props.points.map((point) => {
              const total = sum(point.values)
              const rows = point.values.map((value, index) => ({
                id: `series-${index}`,
                label: props.series[index]?.label ?? '',
                value: formatOf(index)(value),
                dot: DOT_COLORS[index % DOT_COLORS.length],
              }))
              if (stacked) {
                rows.push({
                  id: 'total',
                  label: t('Total'),
                  value: formatOf(0)(total),
                  dot: '',
                })
              }
              const ariaLabel = [
                point.title,
                ...rows.map((row) => `${row.label} ${row.value}`),
                ...(point.extra ?? []).map(
                  (row) => `${row.label} ${row.value}`
                ),
              ].join(', ')
              return (
                <li key={point.key} className='flex h-full min-w-0 flex-1'>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <div
                          tabIndex={0}
                          aria-label={ariaLabel}
                          className='group/bar focus-visible:ring-ring/50 hover:bg-muted/40 flex flex-1 flex-col-reverse items-stretch justify-start rounded-sm outline-none focus-visible:ring-3'
                        />
                      }
                    >
                      {total === 0 ? (
                        <span className='bg-border min-h-px w-full' />
                      ) : (
                        point.values.map((value, index) => (
                          <span
                            key={rows[index].id}
                            className={cn(
                              'w-full first:rounded-b-none last:rounded-t-[3px]',
                              SEGMENT_COLORS[index % SEGMENT_COLORS.length]
                            )}
                            style={{
                              height: `${max > 0 ? (value / max) * 100 : 0}%`,
                            }}
                          />
                        ))
                      )}
                    </TooltipTrigger>
                    <TooltipContent className='block min-w-40 py-2'>
                      <p className='mb-1.5 font-semibold'>{point.title}</p>
                      <dl className='grid grid-cols-[1fr_auto] gap-x-4 gap-y-1'>
                        {rows.map((row) => (
                          <div key={row.id} className='contents'>
                            <dt
                              className={cn(
                                'flex items-center gap-1.5 opacity-80',
                                row.id === 'total' && 'font-medium opacity-100'
                              )}
                            >
                              {row.dot && (
                                <span
                                  className={cn('size-2 rounded-sm', row.dot)}
                                />
                              )}
                              {row.label}
                            </dt>
                            <dd
                              className={cn(
                                'text-right tabular-nums',
                                row.id === 'total' && 'font-medium'
                              )}
                            >
                              {row.value}
                            </dd>
                          </div>
                        ))}
                        {(point.extra ?? []).map((row) => (
                          <div key={row.label} className='contents'>
                            <dt className='opacity-80'>{row.label}</dt>
                            <dd className='text-right tabular-nums'>
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            })}
          </ol>
        </TooltipProvider>
        <span aria-hidden />
        <div
          aria-hidden
          className='text-muted-foreground -mt-1 flex justify-between gap-2 text-[10px] tabular-nums'
        >
          <span>{first?.title}</span>
          {last !== first && <span>{last?.title}</span>}
        </div>
      </div>
      {stacked && (
        <ul className='text-muted-foreground flex flex-wrap gap-3 text-xs'>
          {props.series.map((item, index) => (
            <li key={item.label} className='flex items-center gap-1.5'>
              <span
                className={cn(
                  'size-2 rounded-sm',
                  DOT_COLORS[index % DOT_COLORS.length]
                )}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Horizontal share bars for a breakdown. */
export function Breakdown(props: {
  items: NamedCount[] | null | undefined
  label?: (name: string) => string
  empty: string
}) {
  const fmt = useInsightsFormat()
  const items = props.items ?? []
  const total = items.reduce((sum, item) => sum + item.count, 0)
  if (items.length === 0) {
    return <p className='text-muted-foreground text-xs'>{props.empty}</p>
  }
  return (
    <ul className='grid gap-2 text-sm'>
      {items.map((item) => (
        <li key={item.name} className='grid gap-1'>
          <div className='flex items-center justify-between gap-2'>
            <span className='truncate'>
              {props.label ? props.label(item.name) : item.name}
            </span>
            <span className='text-muted-foreground shrink-0 tabular-nums'>
              {fmt.num(item.count)} · {fmt.pct(total ? item.count / total : 0)}
            </span>
          </div>
          <div className='bg-muted h-1.5 overflow-hidden rounded-full'>
            <div
              className='bg-primary/60 h-full rounded-full'
              style={{ width: `${total ? (item.count / total) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export type Column<T> = {
  key: string
  label: string
  align?: 'right'
  render: (row: T) => ReactNode
}

export function SimpleTable<T>(props: {
  columns: Column<T>[]
  rows: T[] | null | undefined
  rowKey: (row: T, index: number) => string | number
  empty: string
}) {
  const rows = props.rows ?? []
  if (rows.length === 0) {
    return <p className='text-muted-foreground text-xs'>{props.empty}</p>
  }
  return (
    <div className='-mx-4 overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            {props.columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  'first:pl-4 last:pr-4',
                  column.align === 'right' && 'text-right'
                )}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={props.rowKey(row, index)}>
              {props.columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    'tabular-nums first:pl-4 last:pr-4',
                    column.align === 'right' && 'text-right'
                  )}
                >
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function UserLabel(props: { user_id: number; username: string }) {
  return (
    <span className='truncate'>
      {props.username || '-'}{' '}
      <span className='text-muted-foreground font-mono text-xs'>
        #{props.user_id}
      </span>
    </span>
  )
}

export function TruncatedNotice(props: { show: boolean }) {
  const { t } = useTranslation()
  if (!props.show) return null
  return (
    <p className='text-xs text-amber-600 dark:text-amber-400'>
      {t(
        'This range has more request logs than one view reads; figures cover the newest 200,000.'
      )}
    </p>
  )
}
