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
import { ChevronRight, Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TitledCard } from '@/components/ui/titled-card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { SecondLevel } from '../types'

type SecondLevelCardProps = {
  secondLevel: SecondLevel
  inviteeCount: number
  directCommission: number
  directRate: number
  secondLevelRate: number
  /** False for a former distributor, who keeps what it earned but earns no more */
  earning: boolean
}

// SecondLevelCard explains the second level as the chain it comes from, splits
// everything the caller earned into its two levels so the balance adds up, and
// lists which invitees brought the second-level users in.
export function SecondLevelCard(props: SecondLevelCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const second = props.secondLevel
  const total = props.directCommission + second.commission

  const shares = [
    {
      key: 'direct',
      label: t('Direct invitees'),
      amount: props.directCommission,
      dot: 'bg-info',
    },
    {
      key: 'second',
      label: t('Second level'),
      amount: second.commission,
      dot: 'bg-chart-4',
    },
  ].map((share) => ({
    ...share,
    percent: total > 0 ? Math.round((share.amount * 100) / total) : 0,
  }))

  const chain = [
    {
      key: 'invitees',
      label: t('Your invitees'),
      count: props.inviteeCount,
      rate: props.directRate,
      dot: 'bg-info',
    },
    {
      key: 'second',
      label: t('Users they invited'),
      count: second.invitee_count,
      rate: props.secondLevelRate,
      dot: 'bg-chart-4',
    },
  ]

  // The sources, then their total, as rows of the same three figures; wide
  // screens show them as a table and phones as a list.
  const sourceRows = second.sources.map((source) => ({
    id: String(source.id),
    name: source.name,
    count: source.invitee_count,
    base: source.commission_base,
    commission: source.commission,
  }))
  const totalRow = {
    id: 'all',
    name: t('All'),
    count: second.invitee_count,
    base: second.commission_base,
    commission: second.commission,
  }
  const figures = [
    {
      key: 'count',
      label: t('Users they invited'),
      format: (row: typeof totalRow) => formatNumber(row.count, locale),
    },
    {
      key: 'base',
      label: t('Paid spend'),
      format: (row: typeof totalRow) => formatQuota(row.base),
    },
    {
      key: 'commission',
      label: t('Your commission'),
      format: (row: typeof totalRow) => formatQuota(row.commission),
    },
  ]

  return (
    <TitledCard
      title={t('Second-level commission')}
      description={
        props.earning
          ? t(
              'When users you invited invite others, you also earn {{rate}}% of what those users pay to use.',
              { rate: props.secondLevelRate }
            )
          : t(
              'Second-level commission is for distributors. What you earned stays in your balance.'
            )
      }
      icon={<Network />}
      iconTone='chart-4'
      action={
        <StatusBadge
          label={t('Second level {{rate}}%', { rate: props.secondLevelRate })}
          variant='purple'
          copyable={false}
        />
      }
      disableHoverEffect
      contentClassName='grid gap-5 p-3 sm:p-5'
    >
      <div className='grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]'>
        <div className='bg-muted/30 flex flex-col justify-center rounded-lg border p-3'>
          <span className='text-muted-foreground text-xs'>{t('You')}</span>
          <span className='mt-0.5 text-base font-semibold tabular-nums'>
            {formatQuota(total)}
          </span>
          <span className='text-muted-foreground text-xs'>
            {t('Earned in total')}
          </span>
        </div>
        {chain.map((step) => (
          <div key={step.key} className='contents'>
            <ChevronRight
              aria-hidden='true'
              className='text-muted-foreground mx-auto size-4 rotate-90 self-center sm:rotate-0'
            />
            <div className='bg-muted/30 flex flex-col justify-center rounded-lg border p-3'>
              <span className='text-muted-foreground truncate text-xs'>
                {step.label}
              </span>
              <span className='mt-0.5 text-base font-semibold tabular-nums'>
                {formatNumber(step.count, locale)}
              </span>
              <span className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <span
                  aria-hidden='true'
                  className={cn('size-2 shrink-0 rounded-full', step.dot)}
                />
                {t('You earn {{rate}}% of their paid spend', {
                  rate: step.rate,
                })}
              </span>
            </div>
          </div>
        ))}
      </div>

      <section className='grid gap-3' aria-labelledby='second-level-split'>
        <h3 id='second-level-split' className='text-sm font-medium'>
          {t('Where your commission comes from')}
        </h3>
        <div className='bg-muted flex h-2.5 overflow-hidden rounded-full'>
          {shares
            .filter((share) => share.amount > 0)
            .map((share) => (
              <Tooltip key={share.key}>
                <TooltipTrigger
                  render={
                    <div
                      tabIndex={0}
                      aria-label={`${share.label} ${formatQuota(share.amount)}`}
                      className={cn(
                        'focus-visible:ring-ring h-full min-w-1 outline-none focus-visible:ring-2',
                        share.dot
                      )}
                      style={{ width: `${(share.amount * 100) / total}%` }}
                    />
                  }
                />
                <TooltipContent>
                  {share.label}: {formatQuota(share.amount)} (
                  {formatPercent(share.percent)})
                </TooltipContent>
              </Tooltip>
            ))}
        </div>
        <dl className='grid gap-x-6 gap-y-2 sm:grid-cols-3'>
          {shares.map((share) => (
            <div key={share.key} className='min-w-0'>
              <dt className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <span
                  aria-hidden='true'
                  className={cn('size-2 shrink-0 rounded-full', share.dot)}
                />
                {share.label}
              </dt>
              <dd className='mt-0.5 flex items-baseline gap-1.5'>
                <span className='text-base font-semibold tabular-nums'>
                  {formatQuota(share.amount)}
                </span>
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {formatPercent(share.percent)}
                </span>
              </dd>
            </div>
          ))}
          <div className='min-w-0 sm:border-l sm:pl-6'>
            <dt className='text-muted-foreground text-xs'>
              {t('Earned in total')}
            </dt>
            <dd className='mt-0.5 text-base font-semibold tabular-nums'>
              {formatQuota(total)}
            </dd>
          </div>
        </dl>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Your commission balance is this total less what you transferred to your wallet or withdrew.'
          )}
        </p>
      </section>

      <section className='grid gap-3' aria-labelledby='second-level-sources'>
        <h3 id='second-level-sources' className='text-sm font-medium'>
          {t('Brought in by your invitees')}
        </h3>
        {second.sources.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('None of your invitees has invited anyone yet.')}
          </p>
        ) : (
          <>
            <div className='hidden overflow-hidden rounded-lg border sm:block'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Invitee')}</TableHead>
                    {figures.map((figure) => (
                      <TableHead key={figure.key} className='text-right'>
                        {figure.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className='max-w-48 truncate font-medium'>
                        {row.name}
                      </TableCell>
                      {figures.map((figure) => (
                        <TableCell
                          key={figure.key}
                          className='text-right tabular-nums'
                        >
                          {figure.format(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>{totalRow.name}</TableCell>
                    {figures.map((figure) => (
                      <TableCell
                        key={figure.key}
                        className='text-right font-semibold tabular-nums'
                      >
                        {figure.format(totalRow)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <ul className='divide-y rounded-lg border sm:hidden'>
              {[...sourceRows, totalRow].map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    'grid gap-2 p-3',
                    row === totalRow && 'bg-muted/50'
                  )}
                >
                  <span className='truncate text-sm font-medium'>
                    {row.name}
                  </span>
                  <dl className='grid grid-cols-3 gap-2'>
                    {figures.map((figure) => (
                      <div key={figure.key} className='min-w-0'>
                        <dt className='text-muted-foreground text-xs'>
                          {figure.label}
                        </dt>
                        <dd className='text-sm tabular-nums'>
                          {figure.format(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
        {second.source_count > second.sources.length && (
          <p className='text-muted-foreground text-xs'>
            {t('Showing the {{shown}} invitees who earned you the most.', {
              shown: second.sources.length,
            })}
          </p>
        )}
      </section>
    </TitledCard>
  )
}
