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

import { cn } from '@/lib/utils'

import { useInsightsFormat, useSignupMethodLabel } from '../lib'
import type { ActivityInsights, FunnelRow, GrowthInsights } from '../types'
import { BarSeries, MetricGrid, Panel, SimpleTable, UserLabel } from './shared'

export function GrowthTab(props: { data: GrowthInsights | undefined }) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const label = useSignupMethodLabel()
  const data = props.data
  const funnel = data?.funnel
  const rate = (part: number, whole: number) =>
    whole ? fmt.pct(part / whole) : '-'
  const funnelColumns = [
    {
      key: 'segment',
      label: t('Segment'),
      render: (row: FunnelRow) => label(row.segment),
    },
    {
      key: 'reg',
      label: t('Registered'),
      align: 'right' as const,
      render: (row: FunnelRow) => fmt.num(row.registered),
    },
    {
      key: 'act',
      label: t('Activated'),
      align: 'right' as const,
      render: (row: FunnelRow) =>
        `${fmt.num(row.activated)} · ${rate(row.activated, row.registered)}`,
    },
    {
      key: 'paid',
      label: t('Has paid'),
      align: 'right' as const,
      render: (row: FunnelRow) =>
        `${fmt.num(row.paid)} · ${rate(row.paid, row.registered)}`,
    },
    {
      key: 'repeat',
      label: t('Paid again'),
      align: 'right' as const,
      render: (row: FunnelRow) =>
        `${fmt.num(row.repeat)} · ${rate(row.repeat, row.paid)}`,
    },
  ]

  return (
    <div className='grid gap-4'>
      <MetricGrid
        loading={!data}
        items={[
          { label: t('Registered'), value: fmt.num(funnel?.registered ?? 0) },
          {
            label: t('Activated'),
            value: fmt.num(funnel?.activated ?? 0),
            hint: rate(funnel?.activated ?? 0, funnel?.registered ?? 0),
            tone:
              funnel &&
              funnel.registered > 0 &&
              funnel.activated / funnel.registered < 0.3
                ? 'warning'
                : 'default',
          },
          {
            label: t('Has paid'),
            value: fmt.num(funnel?.paid ?? 0),
            hint: rate(funnel?.paid ?? 0, funnel?.registered ?? 0),
          },
          {
            label: t('Paid again'),
            value: fmt.num(funnel?.repeat ?? 0),
            hint: rate(funnel?.repeat ?? 0, funnel?.paid ?? 0),
          },
          {
            label: t('Plan buyers'),
            value: fmt.num(data?.subscription_buyers ?? 0),
          },
          {
            label: t('Plan → top-up'),
            value: fmt.num(data?.subscription_to_topup ?? 0),
            hint: rate(
              data?.subscription_to_topup ?? 0,
              data?.subscription_buyers ?? 0
            ),
          },
        ]}
      />
      <p className='text-muted-foreground text-xs'>
        {t(
          'Accounts created in the range, followed up to now. Activated: sent a request. Paid: completed a gateway order.'
        )}
      </p>
      <Panel title={t('Sign-ups by day and what they did')}>
        <BarSeries
          ariaLabel={t('Sign-ups by day')}
          legend={[t('Has paid'), t('Activated, not paid'), t('Not activated')]}
          points={(data?.daily ?? []).map((day) => ({
            key: day.day,
            values: [
              day.paid,
              Math.max(day.activated - day.paid, 0),
              Math.max(day.registered - day.activated, 0),
            ],
            label: t(
              '{{date}}: {{registered}} registered, {{activated}} activated, {{paid}} paid',
              {
                date: fmt.day(day.day),
                registered: day.registered,
                activated: day.activated,
                paid: day.paid,
              }
            ),
          }))}
        />
      </Panel>
      <div className='grid gap-4 lg:grid-cols-2'>
        <Panel title={t('Funnel by sign-up method')}>
          <SimpleTable
            rows={data?.by_source}
            rowKey={(row) => row.segment}
            empty={t('No sign-ups in this range')}
            columns={funnelColumns}
          />
        </Panel>
        <Panel title={t('Funnel by referral')}>
          <SimpleTable
            rows={data?.by_invite}
            rowKey={(row) => row.segment}
            empty={t('No sign-ups in this range')}
            columns={funnelColumns}
          />
        </Panel>
      </div>
    </div>
  )
}

export function ActivityTab(props: { data: ActivityInsights | undefined }) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const data = props.data
  const last = data?.daily.at(-1)

  return (
    <div className='grid gap-4'>
      <MetricGrid
        loading={!data}
        items={[
          { label: t('Active users'), value: fmt.num(data?.active_users ?? 0) },
          { label: t('DAU (last day)'), value: fmt.num(last?.dau ?? 0) },
          { label: t('WAU (last day)'), value: fmt.num(last?.wau ?? 0) },
          { label: t('Consumption'), value: fmt.usd(data?.quota_usd ?? 0) },
          {
            label: t('Top 3 share'),
            value: fmt.pct(data?.top3_share ?? 0),
            hint: t('Top 1: {{top1}} · Top 10: {{top10}}', {
              top1: fmt.pct(data?.top1_share ?? 0),
              top10: fmt.pct(data?.top10_share ?? 0),
            }),
            tone: (data?.top3_share ?? 0) > 0.6 ? 'warning' : 'default',
          },
          { label: t('Requests'), value: fmt.num(data?.requests ?? 0) },
        ]}
      />
      <div className='grid gap-4 lg:grid-cols-2'>
        <Panel title={t('Daily active users')}>
          <BarSeries
            ariaLabel={t('Daily active users')}
            points={(data?.daily ?? []).map((day) => ({
              key: day.day,
              values: [day.dau],
              label: t('{{date}}: DAU {{dau}}, WAU {{wau}}', {
                date: fmt.day(day.day),
                dau: day.dau,
                wau: day.wau,
              }),
            }))}
          />
        </Panel>
        <Panel title={t('Daily consumption')}>
          <BarSeries
            ariaLabel={t('Daily consumption')}
            points={(data?.daily ?? []).map((day) => ({
              key: day.day,
              values: [day.quota_usd],
              label: t('{{date}}: {{amount}}, {{requests}} requests', {
                date: fmt.day(day.day),
                amount: fmt.usd(day.quota_usd),
                requests: day.requests,
              }),
            }))}
          />
        </Panel>
      </div>
      <Panel
        title={t('Retention by sign-up day')}
        description={t(
          'Share of each day’s sign-ups that sent a request N days later. Day 0 is the sign-up day.'
        )}
      >
        <RetentionGrid data={data} />
      </Panel>
      <Panel title={t('Top customers by consumption')}>
        <SimpleTable
          rows={data?.top_users}
          rowKey={(row) => row.user_id}
          empty={t('No consumption in this range')}
          columns={[
            {
              key: 'user',
              label: t('User'),
              render: (row) => <UserLabel {...row} />,
            },
            {
              key: 'usd',
              label: t('Consumption'),
              align: 'right',
              render: (row) => fmt.usd(row.quota_usd),
            },
            {
              key: 'share',
              label: t('Share'),
              align: 'right',
              render: (row) => fmt.pct(row.share),
            },
            {
              key: 'req',
              label: t('Requests'),
              align: 'right',
              render: (row) => fmt.num(row.requests),
            },
          ]}
        />
      </Panel>
    </div>
  )
}

function RetentionGrid(props: { data: ActivityInsights | undefined }) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const cohorts = props.data?.retention ?? []
  if (cohorts.length === 0) {
    return (
      <p className='text-muted-foreground text-xs'>
        {t('No sign-ups in this range')}
      </p>
    )
  }
  const width = Math.max(...cohorts.map((cohort) => cohort.days?.length ?? 0))
  return (
    <div className='-mx-4 overflow-x-auto px-4'>
      <table className='text-xs tabular-nums'>
        <thead>
          <tr className='text-muted-foreground'>
            <th className='pr-3 text-left font-normal'>{t('Sign-up day')}</th>
            <th className='pr-3 text-right font-normal'>{t('Users')}</th>
            {Array.from({ length: width }, (_, day) => (
              <th key={day} className='w-11 text-center font-normal'>
                D{day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.day}>
              <td className='pr-3 whitespace-nowrap'>{fmt.day(cohort.day)}</td>
              <td className='pr-3 text-right'>{cohort.size}</td>
              {Array.from({ length: width }, (_, day) => {
                const value = cohort.days?.[day]
                return (
                  <td key={day} className='p-0.5'>
                    {value == null ? null : (
                      <span
                        className={cn(
                          'block rounded px-1 py-0.5 text-center',
                          value > 0.5 && 'text-primary-foreground'
                        )}
                        style={{
                          backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(value * 100)}%, transparent)`,
                        }}
                      >
                        {Math.round(value * 100)}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
