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

import { getPaymentMethodName } from '@/features/wallet/lib/billing'

import { useInsightsFormat } from '../lib'
import type { FinanceInsights } from '../types'
import { BarSeries, MetricGrid, Panel, SimpleTable, UserLabel } from './shared'

export function FinanceTab(props: { data: FinanceInsights | undefined }) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const data = props.data

  return (
    <div className='grid gap-4'>
      <MetricGrid
        loading={!data}
        items={[
          {
            label: t('Revenue'),
            value: fmt.cny(data?.revenue ?? 0),
            hint: t('{{orders}} orders · {{users}} payers', {
              orders: data?.orders ?? 0,
              users: data?.paying_users ?? 0,
            }),
          },
          {
            label: t('Top-ups / subscriptions'),
            value: `${fmt.cny(data?.topup_revenue ?? 0)} / ${fmt.cny(data?.subscription_revenue ?? 0)}`,
          },
          {
            label: t('Consumption at list price'),
            value: fmt.usd(data?.consumption_usd ?? 0),
          },
          {
            label: t('Revenue per $1 consumed'),
            value: fmt.cny(data?.revenue_per_usd ?? 0),
            hint: t('Revenue ÷ list-price consumption'),
          },
          {
            label: t('Balances owed'),
            value: fmt.usd(data?.liability_usd ?? 0),
            hint: t('{{count}} customers, now', {
              count: data?.liability_users ?? 0,
            }),
            tone:
              (data?.liability_usd ?? 0) > (data?.consumption_usd ?? 0)
                ? 'warning'
                : 'default',
          },
          {
            label: t('Debt (negative balances)'),
            value: fmt.usd(data?.debt_usd ?? 0),
            hint: t('{{count}} customers', {
              count: data?.debtors.length ?? 0,
            }),
            tone: (data?.debt_usd ?? 0) < 0 ? 'danger' : 'good',
          },
        ]}
      />

      <Panel
        title={t('Daily revenue and consumption')}
        description={t(
          'Revenue in the payment currency; consumption in USD at list price.'
        )}
      >
        <BarSeries
          ariaLabel={t('Daily revenue')}
          legend={[t('Top-ups'), t('Subscriptions')]}
          points={(data?.daily ?? []).map((day) => ({
            key: day.day,
            values: [day.topup, day.subscription],
            label: t(
              '{{date}}: top-ups {{topup}}, plans {{plan}}, consumed {{used}}',
              {
                date: fmt.day(day.day),
                topup: fmt.cny(day.topup),
                plan: fmt.cny(day.subscription),
                used: fmt.usd(day.consumption_usd),
              }
            ),
          }))}
        />
      </Panel>

      <div className='grid gap-4 lg:grid-cols-3'>
        <Panel title={t('Wallet credit issued')}>
          <dl className='grid gap-2 text-sm'>
            {[
              [t('Top-up credit'), fmt.usd(data?.topup_credit_usd ?? 0)],
              [t('Top-up bonus'), fmt.usd(data?.bonus_usd ?? 0)],
              [t('Redemption codes'), fmt.usd(data?.redemption_usd ?? 0)],
              [t('Referral commission'), fmt.usd(data?.commission_usd ?? 0)],
              [
                t('Manual adjustments (net)'),
                fmt.usd(data?.adjustment_net_usd ?? 0),
              ],
            ].map(([label, value]) => (
              <div key={label} className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='tabular-nums'>{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={t('By payment method')}>
          <SimpleTable
            rows={data?.methods}
            rowKey={(row) => row.payment_method}
            empty={t('No successful orders in this range')}
            columns={[
              {
                key: 'method',
                label: t('Payment Method'),
                render: (row) =>
                  getPaymentMethodName(row.payment_method, t) ||
                  row.payment_method,
              },
              {
                key: 'count',
                label: t('Orders'),
                align: 'right',
                render: (row) => row.count,
              },
              {
                key: 'money',
                label: t('Amount'),
                align: 'right',
                render: (row) => fmt.cny(row.money),
              },
            ]}
          />
        </Panel>
        <Panel title={t('Largest balances')}>
          <SimpleTable
            rows={data?.top_balances}
            rowKey={(row) => row.user_id}
            empty={t('No customer balances')}
            columns={[
              {
                key: 'user',
                label: t('User'),
                render: (row) => <UserLabel {...row} />,
              },
              {
                key: 'b',
                label: t('Balance'),
                align: 'right',
                render: (row) => fmt.usd(row.balance_usd),
              },
            ]}
          />
        </Panel>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Panel
          title={t('Manual balance adjustments')}
          description={t(
            'From the audit log: who changed whose balance, and by how much.'
          )}
        >
          <SimpleTable
            rows={data?.adjustments}
            rowKey={(row, index) => `${row.created_at}-${index}`}
            empty={t('No manual adjustments in this range')}
            columns={[
              {
                key: 'at',
                label: t('Time'),
                render: (row) => fmt.time(row.created_at),
              },
              {
                key: 'op',
                label: t('Operator'),
                render: (row) => row.operator,
              },
              {
                key: 'target',
                label: t('User'),
                render: (row) => <UserLabel {...row.target} />,
              },
              {
                key: 'delta',
                label: t('Change'),
                align: 'right',
                render: (row) => {
                  if (!row.success) return t('Failed')
                  if (!row.has_snapshot) {
                    return `${row.mode} ${fmt.usd(row.request_usd)}`
                  }
                  return `${fmt.usd(row.before_usd)} → ${fmt.usd(row.after_usd)}`
                },
              },
            ]}
          />
        </Panel>
        <Panel title={t('Negative balances')}>
          <SimpleTable
            rows={data?.debtors}
            rowKey={(row) => row.user_id}
            empty={t('No customer owes money')}
            columns={[
              {
                key: 'user',
                label: t('User'),
                render: (row) => <UserLabel {...row} />,
              },
              {
                key: 'b',
                label: t('Balance'),
                align: 'right',
                render: (row) => fmt.usd(row.balance_usd),
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}
