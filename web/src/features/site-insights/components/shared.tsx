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
  /** Stacked segments, bottom first. */
  values: number[]
  label: string
}

const SEGMENT_COLORS = [
  'bg-primary/60 group-hover/bar:bg-primary',
  'bg-sky-500/60 group-hover/bar:bg-sky-500',
  'bg-amber-500/60 group-hover/bar:bg-amber-500',
  'bg-rose-500/60 group-hover/bar:bg-rose-500',
]

/** A bar per point; each bar's tooltip is its label. */
export function BarSeries(props: {
  points: BarPoint[]
  legend?: string[]
  className?: string
  ariaLabel: string
}) {
  const max = Math.max(
    0,
    ...props.points.map((point) => point.values.reduce((a, b) => a + b, 0))
  )
  return (
    <div className={cn('grid gap-2', props.className)}>
      <ol
        className='flex h-40 items-end gap-px sm:gap-0.5'
        aria-label={props.ariaLabel}
      >
        {props.points.map((point) => {
          const total = point.values.reduce((a, b) => a + b, 0)
          const segments = point.values.map((value, index) => ({
            id: `segment-${index}`,
            value,
            color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
          }))
          return (
            <li key={point.key} className='flex h-full min-w-0 flex-1'>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      tabIndex={0}
                      aria-label={point.label}
                      className='group/bar focus-visible:ring-ring/50 flex flex-1 flex-col-reverse items-stretch justify-start rounded-sm outline-none focus-visible:ring-3'
                    />
                  }
                >
                  {total === 0 ? (
                    <span className='bg-border min-h-px w-full' />
                  ) : (
                    segments.map((segment) => (
                      <span
                        key={segment.id}
                        className={cn(
                          'w-full first:rounded-b-none last:rounded-t-[3px]',
                          segment.color
                        )}
                        style={{
                          height: `${max > 0 ? (segment.value / max) * 100 : 0}%`,
                        }}
                      />
                    ))
                  )}
                </TooltipTrigger>
                <TooltipContent>{point.label}</TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ol>
      {props.legend && props.legend.length > 1 && (
        <ul className='text-muted-foreground flex flex-wrap gap-3 text-xs'>
          {props.legend.map((name, index) => (
            <li key={name} className='flex items-center gap-1.5'>
              <span
                className={cn(
                  'size-2 rounded-sm',
                  SEGMENT_COLORS[index % SEGMENT_COLORS.length].split(' ')[0]
                )}
              />
              {name}
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
