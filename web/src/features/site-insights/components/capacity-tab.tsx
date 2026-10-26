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

import { Badge } from '@/components/ui/badge'

import { useErrorCategoryLabel, useInsightsFormat } from '../lib'
import type { CapacityInsights, EngineAccount } from '../types'
import {
  BarSeries,
  Breakdown,
  MetricGrid,
  Panel,
  SimpleTable,
  TruncatedNotice,
  UserLabel,
} from './shared'

export function CapacityTab(props: { data: CapacityInsights | undefined }) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const categoryLabel = useErrorCategoryLabel()
  const data = props.data
  const pool = data?.pool
  const engineRejections =
    data?.error_categories.find((item) => item.name === 'engine_concurrency')
      ?.count ?? 0

  return (
    <div className='grid gap-4'>
      <MetricGrid
        loading={!data}
        items={[
          {
            label: t('In flight now'),
            value: fmt.num(data?.in_flight ?? 0),
            hint: pool?.configured
              ? t('{{slots}} pool slots', { slots: pool.effective_slots })
              : undefined,
            tone:
              pool?.configured &&
              pool.effective_slots > 0 &&
              (data?.in_flight ?? 0) >= pool.effective_slots * 0.8
                ? 'danger'
                : 'default',
          },
          {
            label: t('Peak concurrency'),
            value: fmt.num(data?.peak_concurrency ?? 0),
            hint: data ? fmt.time(data.peak_at) : undefined,
            tone:
              pool?.configured &&
              (data?.peak_concurrency ?? 0) > pool.effective_slots
                ? 'danger'
                : 'default',
          },
          {
            label: t('Peak requests per minute'),
            value: fmt.num(data?.peak_rpm ?? 0),
            hint: data ? fmt.time(data.peak_rpm_at) : undefined,
          },
          {
            label: t('Requests'),
            value: fmt.num(data?.requests ?? 0),
            hint: t('{{count}} failed', { count: data?.errors ?? 0 }),
          },
          {
            label: t('Pool full (engine 429)'),
            value: fmt.num(engineRejections),
            tone: engineRejections > 0 ? 'danger' : 'good',
          },
          {
            label: t('Per-user limit 429 (48h)'),
            value: fmt.num(data?.limit_rejection_total ?? 0),
            hint: t('Since this server started'),
            tone:
              (data?.limit_rejection_total ?? 0) > 0 ? 'warning' : 'default',
          },
        ]}
      />
      <TruncatedNotice show={!!data?.truncated} />

      <Panel
        title={t('Subscription pool')}
        description={
          pool?.configured
            ? t(
                'Eligible accounts are available and under both quota budgets. Slots are eligible accounts × per-account concurrency.'
              )
            : t(
                'Set EngineControlURL and EngineControlKey to read the pool from corecode-engine.'
              )
        }
      >
        {pool?.error && (
          <p className='text-destructive mb-3 text-xs'>{pool.error}</p>
        )}
        {pool?.configured && !pool.error && (
          <div className='grid gap-3'>
            <MetricGrid
              items={[
                {
                  label: t('Eligible accounts'),
                  value: `${pool.eligible_accounts} / ${pool.accounts.length}`,
                  tone: pool.eligible_accounts <= 2 ? 'danger' : 'default',
                },
                {
                  label: t('Effective slots'),
                  value: fmt.num(pool.effective_slots),
                },
                {
                  label: t('Per-account concurrency'),
                  value: fmt.num(pool.credential_concurrency),
                },
                {
                  label: t('5h budget'),
                  value: pool.five_hour_budget
                    ? `${pool.five_hour_budget}%`
                    : '-',
                },
                {
                  label: t('7d budget'),
                  value: pool.seven_day_budget
                    ? `${pool.seven_day_budget}%`
                    : '-',
                },
              ]}
            />
            <SimpleTable<EngineAccount>
              rows={pool.accounts}
              rowKey={(row) => row.credential_id}
              empty={t('No accounts')}
              columns={[
                {
                  key: 'id',
                  label: t('Account'),
                  render: (row) => (
                    <span className='font-mono text-xs'>
                      #{row.credential_id} {row.email_mask}
                    </span>
                  ),
                },
                { key: 'group', label: t('Group'), render: (row) => row.group },
                {
                  key: 'tier',
                  label: t('Tier'),
                  render: (row) => row.tier || row.plan || '-',
                },
                {
                  key: 'status',
                  label: t('Status'),
                  render: (row) => (
                    <Badge variant={row.eligible ? 'outline' : 'destructive'}>
                      {row.eligible ? t('Eligible') : row.status}
                    </Badge>
                  ),
                },
                {
                  key: 'five',
                  label: '5h',
                  align: 'right',
                  render: (row) => (
                    <QuotaCell
                      used={row.five_hour}
                      budget={pool.five_hour_budget}
                    />
                  ),
                },
                {
                  key: 'seven',
                  label: '7d',
                  align: 'right',
                  render: (row) => (
                    <QuotaCell
                      used={row.seven_day}
                      budget={pool.seven_day_budget}
                    />
                  ),
                },
                {
                  key: 'reset',
                  label: t('7d resets'),
                  align: 'right',
                  render: (row) =>
                    row.seven_day_reset_ms
                      ? fmt.time(Math.floor(row.seven_day_reset_ms / 1000))
                      : '-',
                },
              ]}
            />
          </div>
        )}
      </Panel>

      <Panel
        title={t('Hourly peak concurrency')}
        description={t(
          'Reconstructed from request logs: each request was in flight from its start to its end.'
        )}
      >
        <BarSeries
          ariaLabel={t('Hourly peak concurrency')}
          points={(data?.hourly ?? []).map((hour) => ({
            key: hour.hour,
            values: [hour.peak_concurrency],
            label: t('{{time}}: peak {{peak}}, {{requests}} requests', {
              time: fmt.time(hour.hour),
              peak: hour.peak_concurrency,
              requests: hour.requests,
            }),
          }))}
        />
      </Panel>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Panel title={t('Rejections by hour')}>
          <BarSeries
            ariaLabel={t('Rejections by hour')}
            legend={[
              t('Engine account concurrency full'),
              t('Claude upstream rate limit'),
            ]}
            points={(data?.hourly ?? []).map((hour) => ({
              key: hour.hour,
              values: [hour.engine_rejections, hour.upstream_rate_limits],
              label: t(
                '{{time}}: {{engine}} pool full, {{upstream}} upstream limit',
                {
                  time: fmt.time(hour.hour),
                  engine: hour.engine_rejections,
                  upstream: hour.upstream_rate_limits,
                }
              ),
            }))}
          />
        </Panel>
        <Panel
          title={t('Failures by cause')}
          description={t(
            'The performance panel leaves out capacity rejections; this counts every failed request in the logs.'
          )}
        >
          <Breakdown
            items={data?.error_categories}
            label={categoryLabel}
            empty={t('No failed requests in this range')}
          />
        </Panel>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Panel
          title={t('In flight by user')}
          description={t(
            'Live, on this server. Limit comes from the user group.'
          )}
        >
          <SimpleTable
            rows={data?.in_flight_users}
            rowKey={(row) => row.user_id}
            empty={t('No requests in flight')}
            columns={[
              {
                key: 'user',
                label: t('User'),
                render: (row) => <UserLabel {...row} />,
              },
              {
                key: 'n',
                label: t('In flight'),
                align: 'right',
                render: (row) =>
                  row.limit ? `${row.in_flight} / ${row.limit}` : row.in_flight,
              },
            ]}
          />
        </Panel>
        <Panel title={t('Peak concurrency by user')}>
          <SimpleTable
            rows={data?.user_peaks}
            rowKey={(row) => row.user_id}
            empty={t('No requests in this range')}
            columns={[
              {
                key: 'user',
                label: t('User'),
                render: (row) => <UserLabel {...row} />,
              },
              {
                key: 'peak',
                label: t('Peak'),
                align: 'right',
                render: (row) => row.peak,
              },
              {
                key: 'at',
                label: t('At'),
                align: 'right',
                render: (row) => fmt.time(row.peak_at),
              },
              {
                key: 'requests',
                label: t('Requests'),
                align: 'right',
                render: (row) => fmt.num(row.requests),
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}

function QuotaCell(props: { used: number; budget: number }) {
  let tone: string | undefined
  if (props.budget > 0 && props.used >= props.budget) {
    tone = 'text-destructive font-medium'
  } else if (props.budget > 0 && props.used >= props.budget - 10) {
    tone = 'text-amber-600 dark:text-amber-400'
  }
  return <span className={tone}>{Math.round(props.used)}%</span>
}
