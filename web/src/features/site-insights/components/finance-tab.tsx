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

import { DEBT_ALERT_USD, useInsightsFormat } from '../lib'
import type { FinanceInsights } from '../types'
import { BarSeries, MetricGrid, Panel, SimpleTable, UserLabel } from './shared'

export function FinanceTab(props: {
  data: FinanceInsights | undefined
  previous?: FinanceInsights
}) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const data = props.data
  const previous = props.previous
  const daily = data?.daily ?? []
  const best = daily.reduce<(typeof daily)[number] | undefined>(
    (top, day) =>
      !top || day.topup + day.subscription > top.topup + top.subscription
        ? day
        : top,
    undefined
  )
  const issued = [
    data?.topup_credit_usd ?? 0,
    data?.bonus_usd ?? 0,
    data?.redemption_usd ?? 0,
    data?.commission_usd ?? 0,
    data?.adjustment_net_usd ?? 0,
  ].reduce((sum, value) => sum + value, 0)
  let balanceTone: 'danger' | 'warning' | 'default' = 'default'
  if ((data?.debt_usd ?? 0) < DEBT_ALERT_USD) {
    balanceTone = 'danger'
  } else if ((data?.liability_usd ?? 0) > (data?.consumption_usd ?? 0)) {
    balanceTone = 'warning'
  }

  return (
    <div className='grid gap-4'>
      <MetricGrid
        loading={!data}
        items={[
          {
            label: t('Revenue'),
            featured: true,
            value: fmt.cny(data?.revenue ?? 0),
            delta: {
              current: data?.revenue ?? 0,
              previous: previous?.revenue,
              better: 'up',
            },
            trend: daily.map((day) => ({
              title: fmt.day(day.day),
              value: day.topup + day.subscription,
            })),
            trendFormat: fmt.cny,
            hint: t(
              '{{orders}} orders · {{users}} payers · top-ups {{topup}} · plans {{plans}}',
              {
                orders: data?.orders ?? 0,
                users: data?.paying_users ?? 0,
                topup: fmt.cny(data?.topup_revenue ?? 0),
                plans: fmt.cny(data?.subscription_revenue ?? 0),
              }
            ),
          },
          {
            label: t('Revenue earned'),
            value: fmt.cny(data?.recognized_revenue ?? 0),
            delta: {
              current: data?.recognized_revenue ?? 0,
              previous: previous?.recognized_revenue,
              better: 'up',
            },
            hint: t('Wallets {{wallet}} · plans {{plans}}', {
              wallet: fmt.cny(data?.recognized_wallet_revenue ?? 0),
              plans: fmt.cny(data?.recognized_subscription_revenue ?? 0),
            }),
            help: t(
              'The part of all money paid that this range earned. A plan earns its price evenly over the days it runs; a wallet earns as it is spent, each dollar at what its owner paid per dollar credited, gifts included. Given credit earns nothing.'
            ),
          },
          {
            label: t('Customer consumption at list price'),
            value: fmt.usd(data?.consumption_usd ?? 0),
            delta: {
              current: data?.consumption_usd ?? 0,
              previous: previous?.consumption_usd,
              better: 'neutral',
            },
            hint: t('Gifted {{gift}} · root {{root}} left out', {
              gift: fmt.usd(data?.gift_consumption_usd ?? 0),
              root: fmt.usd(data?.root_consumption_usd ?? 0),
            }),
            help: t(
              'Customers’ requests at list price, in USD. Root’s own requests are left out. Gifted is the part no payment covers: given plans and the unpaid share of each wallet.'
            ),
          },
          {
            label: t('Earned per $1 consumed'),
            value: fmt.cny(data?.recognized_per_usd ?? 0),
            delta: {
              current: data?.recognized_per_usd ?? 0,
              previous: previous?.recognized_per_usd,
              better: 'up',
            },
            hint: t('Cash basis {{value}}', {
              value: fmt.cny(data?.revenue_per_usd ?? 0),
            }),
            help: t(
              'Revenue earned divided by customer consumption: what each list-price dollar customers used earned. Cash basis divides the money paid in the range instead, which swings with when customers pay.'
            ),
          },
          {
            label: t('Balances owed'),
            value: fmt.usd(data?.liability_usd ?? 0),
            hint: t('{{count}} customers · paid {{paid}} · debt {{debt}}', {
              count: data?.liability_users ?? 0,
              paid: fmt.cny(data?.liability_paid_value ?? 0),
              debt: fmt.usd(data?.debt_usd ?? 0),
            }),
            help: t(
              'Credit customers hold now and can still spend. Paid is what they paid for it at each wallet’s price; the rest was given. Red when debt passes the alert line, amber when the balance exceeds this range’s consumption.'
            ),
            tone: balanceTone,
          },
        ]}
      />

      <Panel
        title={t('Daily revenue and consumption')}
        description={
          best && best.topup + best.subscription > 0
            ? t('Best day {{day}}: {{amount}}.', {
                day: fmt.day(best.day),
                amount: fmt.cny(best.topup + best.subscription),
              })
            : undefined
        }
        help={t(
          'Revenue in the payment currency; consumption in USD at list price, customers only.'
        )}
      >
        <BarSeries
          ariaLabel={t('Daily revenue')}
          series={[
            { label: t('Top-ups'), format: fmt.cny, compact: fmt.cnyCompact },
            { label: t('Subscriptions'), format: fmt.cny },
          ]}
          points={daily.map((day) => ({
            key: day.day,
            title: fmt.day(day.day),
            values: [day.topup, day.subscription],
            extra: [
              {
                label: t('Revenue earned'),
                value: fmt.cny(day.recognized_revenue ?? 0),
              },
              {
                label: t('Consumed at list price'),
                value: fmt.usd(day.consumption_usd),
              },
            ],
          }))}
        />
      </Panel>

      <div className='grid gap-4 lg:grid-cols-3'>
        <Panel
          title={t('Wallet credit issued')}
          description={
            data && issued > 0
              ? t('{{total}} in all; manual adjustments are {{share}}.', {
                  total: fmt.usd(issued),
                  share: fmt.pct((data.adjustment_net_usd ?? 0) / issued),
                })
              : undefined
          }
        >
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
          help={t(
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
