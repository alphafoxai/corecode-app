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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { useInsightsFormat } from '../lib'
import type { EngineAccount, EngineGroup, EnginePool } from '../types'
import { MetricGrid, Panel, SimpleTable } from './shared'

// Statuses that need an operator, as the engine's own console groups them.
const ATTENTION = new Set([
  'reauthorization_required',
  'suspended',
  'blacklisted',
  'quota_observation_unavailable',
])

function statusVariant(account: EngineAccount) {
  if (account.eligible) return 'outline'
  return ATTENTION.has(account.status) ? 'destructive' : 'secondary'
}

function useStatusLabel() {
  const { t } = useTranslation()
  const labels: Record<string, string> = {
    available: t('Available'),
    quota_budget_exceeded: t('Quota budget reached'),
    quota_observation_unavailable: t('No quota reading'),
    cooldown: t('Cooling down'),
    model_cooldown: t('Model cooling down'),
    reauthorization_required: t('Needs reauthorization'),
    suspended: t('Suspended'),
    disabled: t('Disabled'),
    blacklisted: t('Blacklisted'),
  }
  return (status: string) => labels[status] ?? status
}

/**
 * corecode-engine's account pool, live: every group and account the engine's
 * own capacity page shows, read from its control API. Read-only; limits and
 * budgets are still set in the engine.
 */
export function PoolTab(props: { data: EnginePool | undefined }) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const statusLabel = useStatusLabel()
  const [group, setGroup] = useState('all')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const pool = props.data

  if (pool && !pool.configured) {
    return (
      <Panel title={t('Account pool')}>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Set EngineControlURL and EngineControlKey to read the pool from corecode-engine.'
          )}
        </p>
      </Panel>
    )
  }
  if (pool?.error) {
    return (
      <Panel title={t('Account pool')}>
        <p className='text-destructive text-sm'>{pool.error}</p>
      </Panel>
    )
  }

  const accounts = pool?.accounts ?? []
  const attention = accounts.filter((account) => ATTENTION.has(account.status))
  const five = pool?.five_hour_estimate
  const week = pool?.week_estimate
  const usd = (value: number) => fmt.usd(Math.round(value))
  const at = (ms: number) => (ms ? fmt.time(Math.floor(ms / 1000)) : '-')
  const shown = accounts.filter(
    (account) =>
      (group === 'all' || String(account.group_id) === group) &&
      (!attentionOnly || ATTENTION.has(account.status) || !account.eligible)
  )

  return (
    <div className='grid gap-4'>
      <MetricGrid
        loading={!pool}
        items={[
          {
            label: t('Schedulable accounts'),
            value: `${pool?.eligible_accounts ?? 0} / ${accounts.length}`,
            hint: t('{{count}} groups', { count: pool?.groups.length ?? 0 }),
            tone: (pool?.eligible_accounts ?? 0) <= 2 ? 'danger' : 'default',
          },
          {
            label: t('Effective concurrency'),
            value: fmt.num(pool?.effective_slots ?? 0),
            hint: t('{{count}} per account', {
              count: pool?.credential_concurrency ?? 0,
            }),
          },
          {
            label: t('In flight'),
            value: fmt.num(pool?.in_flight ?? 0),
            tone:
              pool &&
              pool.effective_slots > 0 &&
              pool.in_flight >= pool.effective_slots * 0.8
                ? 'warning'
                : 'default',
          },
          {
            label: t('Needs attention'),
            value: fmt.num(attention.length),
            tone: attention.length > 0 ? 'danger' : 'good',
          },
          {
            label: t('5-hour left'),
            value: five ? `≈ ${usd(five.remaining_usd)}` : '-',
            hint: five
              ? t('{{share}} of {{capacity}}', {
                  share: fmt.pct(
                    five.capacity_usd
                      ? five.remaining_usd / five.capacity_usd
                      : 0
                  ),
                  capacity: usd(five.capacity_usd),
                })
              : pool?.estimate_error,
          },
          {
            label: t('7-day left'),
            value: week ? `≈ ${usd(week.remaining_usd)}` : '-',
            hint: week
              ? t('{{share}} of {{capacity}}', {
                  share: fmt.pct(
                    week.capacity_usd
                      ? week.remaining_usd / week.capacity_usd
                      : 0
                  ),
                  capacity: usd(week.capacity_usd),
                })
              : undefined,
          },
        ]}
      />

      <Panel
        title={t('Groups')}
        description={t(
          'Slots are schedulable accounts times the per-account limit, capped by the group limit. Limits and quota budgets are set in corecode-engine.'
        )}
      >
        <SimpleTable<EngineGroup>
          rows={pool?.groups}
          rowKey={(row) => row.id}
          empty={t('No groups')}
          columns={[
            {
              key: 'name',
              label: t('Group'),
              render: (row) => (
                <span className='flex items-center gap-2'>
                  {row.name}
                  {!row.enabled && (
                    <Badge variant='outline'>{t('Disabled')}</Badge>
                  )}
                </span>
              ),
            },
            {
              key: 'accounts',
              label: t('Schedulable / accounts'),
              align: 'right',
              render: (row) => (
                <span
                  className={cn(
                    row.enabled && row.eligible === 0 && 'text-destructive'
                  )}
                >
                  {row.eligible} / {row.accounts}
                </span>
              ),
            },
            {
              key: 'in_flight',
              label: t('In flight / limit'),
              align: 'right',
              render: (row) =>
                `${row.in_flight} / ${row.effective_limit || t('Unlimited')}`,
            },
            {
              key: 'slots',
              label: t('Slots'),
              align: 'right',
              render: (row) => row.slots,
            },
            {
              key: 'budget',
              label: t('Quota budget'),
              align: 'right',
              render: (row) =>
                row.quota_budget
                  ? `5h ${row.five_hour_budget}% · 7d ${row.seven_day_budget}%`
                  : t('Off'),
            },
          ]}
        />
      </Panel>

      <Panel
        title={t('All accounts')}
        description={t(
          'Usage is each account’s own share of its window; remaining dollars come from the engine’s pool estimate. Refreshes every 15 seconds.'
        )}
        actions={
          <span className='text-muted-foreground shrink-0 text-xs'>
            {pool?.observed_at_ms
              ? t('Observed {{time}}', { time: at(pool.observed_at_ms) })
              : null}
          </span>
        }
      >
        <div className='mb-3 flex flex-wrap items-center gap-2'>
          <ToggleGroup
            variant='outline'
            size='sm'
            value={[group]}
            onValueChange={(value: string[]) => setGroup(value.at(-1) ?? 'all')}
          >
            <ToggleGroupItem value='all'>{t('All groups')}</ToggleGroupItem>
            {(pool?.groups ?? []).map((row) => (
              <ToggleGroupItem key={row.id} value={String(row.id)}>
                {row.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            variant='outline'
            size='sm'
            value={attentionOnly ? ['attention'] : []}
            onValueChange={(value: string[]) =>
              setAttentionOnly(value.includes('attention'))
            }
          >
            <ToggleGroupItem value='attention'>
              {t('Not schedulable')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <SimpleTable<EngineAccount>
          rows={shown}
          rowKey={(row) => row.credential_id}
          empty={t('No accounts match')}
          columns={[
            {
              key: 'account',
              label: t('Pool account'),
              render: (row) => (
                <span className='grid'>
                  <span className='font-mono text-xs'>
                    #{row.credential_id} {row.email_mask}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {[row.group, row.plan, row.tier]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              ),
            },
            {
              key: 'status',
              label: t('Status'),
              render: (row) => (
                <span className='grid gap-0.5'>
                  <Badge variant={statusVariant(row)}>
                    {statusLabel(row.status)}
                  </Badge>
                  {row.cooldown_until_ms > 0 && (
                    <span className='text-muted-foreground text-xs'>
                      {t('Until {{time}}', { time: at(row.cooldown_until_ms) })}
                    </span>
                  )}
                </span>
              ),
            },
            {
              key: 'active',
              label: t('In flight'),
              align: 'right',
              render: (row) => `${row.active} / ${row.sessions}`,
            },
            {
              key: 'five',
              label: t('5-hour'),
              align: 'right',
              render: (row) => (
                <WindowCell
                  used={row.five_hour}
                  budget={pool?.five_hour_budget ?? 0}
                  remaining={row.five_hour_remaining_usd}
                  reset={at(row.five_hour_reset_ms)}
                />
              ),
            },
            {
              key: 'seven',
              label: t('7-day'),
              align: 'right',
              render: (row) => (
                <WindowCell
                  used={row.seven_day}
                  budget={pool?.seven_day_budget ?? 0}
                  remaining={row.seven_day_remaining_usd}
                  reset={at(row.seven_day_reset_ms)}
                />
              ),
            },
            {
              key: 'burn',
              label: t('Spend / hour'),
              align: 'right',
              render: (row) =>
                row.burn_usd_per_hour == null
                  ? '-'
                  : fmt.usd(row.burn_usd_per_hour),
            },
            {
              key: 'activity',
              label: t('Last 24 hours'),
              align: 'right',
              render: (row) => <ActivityCell row={row} at={at} />,
            },
          ]}
        />
      </Panel>
    </div>
  )
}

function WindowCell(props: {
  used: number
  budget: number
  remaining: number | null
  reset: string
}) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  let tone: string | undefined
  if (props.budget > 0 && props.used >= props.budget) {
    tone = 'text-destructive font-medium'
  } else if (props.budget > 0 && props.used >= props.budget - 10) {
    tone = 'text-amber-600 dark:text-amber-400'
  }
  return (
    <span className='grid justify-items-end'>
      <span className={tone}>
        {Math.round(props.used)}%
        {props.remaining != null && (
          <span className='text-muted-foreground'>
            {' '}
            · {fmt.usd(Math.round(props.remaining))}
          </span>
        )}
      </span>
      <span className='text-muted-foreground text-xs'>
        {t('Resets {{time}}', { time: props.reset })}
      </span>
    </span>
  )
}

function ActivityCell(props: {
  row: EngineAccount
  at: (ms: number) => string
}) {
  const { t } = useTranslation()
  const { row } = props
  const counts = t('{{success}} ok · {{failure}} failed', {
    success: row.successes,
    failure: row.failures,
  })
  if (!row.last_failure) {
    return <span className='text-xs'>{counts}</span>
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className='cursor-help text-xs underline decoration-dotted' />
        }
      >
        {counts}
      </TooltipTrigger>
      <TooltipContent className='max-w-sm'>
        {t('Last failure {{time}}: {{reason}}', {
          time: props.at(row.last_failure_at_ms),
          reason: row.last_failure,
        })}
      </TooltipContent>
    </Tooltip>
  )
}
