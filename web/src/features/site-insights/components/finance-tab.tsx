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
  const engine = data?.engine_cost
  const engineReady = !!engine?.configured && !engine.error
  // Official-price dollars per new-api dollar charged for Claude.
  const officialPerUSD = engineReady ? (data?.official_per_usd ?? 0) : 0
  const toCharged = (official: number) =>
    officialPerUSD > 0 ? fmt.usd(official / officialPerUSD) : '-'

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
            label: t('Consumption at list price'),
            value: fmt.usd(data?.consumption_usd ?? 0),
            delta: {
              current: data?.consumption_usd ?? 0,
              previous: previous?.consumption_usd,
              better: 'neutral',
            },
            hint: t('USD at list price'),
          },
          {
            label: t('Revenue per $1 consumed'),
            value: fmt.cny(data?.revenue_per_usd ?? 0),
            help: t(
              'Revenue in CNY divided by consumption in USD at list price: what each list-price dollar used brought in.'
            ),
            delta: {
              current: data?.revenue_per_usd ?? 0,
              previous: previous?.revenue_per_usd,
              better: 'up',
            },
          },
          {
            label: t('Balances owed'),
            value: fmt.usd(data?.liability_usd ?? 0),
            hint: t('{{count}} customers, now', {
              count: data?.liability_users ?? 0,
            }),
            help: t(
              'Credit customers hold and can still spend. Colored when it exceeds this range’s consumption.'
            ),
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
            tone: (data?.debt_usd ?? 0) < DEBT_ALERT_USD ? 'danger' : 'default',
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
          'Revenue in the payment currency; consumption in USD at list price.'
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
                label: t('Consumed at list price'),
                value: fmt.usd(day.consumption_usd),
              },
            ],
          }))}
        />
      </Panel>

      <div className='grid gap-4 lg:grid-cols-3'>
        <Panel
          title={t('Claude at official prices')}
          help={t(
            'Charged is what new-api deducted for Claude models at its own ratios; official cost is what corecode-engine priced the same requests at Anthropic’s official prices. Both cover the days the engine reported. Gifted and paid balance count alike.'
          )}
          description={
            officialPerUSD > 0
              ? t(
                  'Each $1 new-api charges for Claude uses {{official}} at official prices.',
                  { official: fmt.usd(officialPerUSD) }
                )
              : undefined
          }
        >
          {engine && !engine.configured && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Set EngineControlURL and EngineControlKey to read official-price cost from corecode-engine.'
              )}
            </p>
          )}
          {engine?.error && (
            <p className='text-destructive text-sm'>{engine.error}</p>
          )}
          {(!engine || engineReady) && (
            <dl className='grid gap-2 text-sm'>
              {[
                [
                  t('Charged for Claude'),
                  fmt.usd(data?.matched_claude_usd ?? 0),
                ],
                [t('Official cost'), fmt.usd(data?.matched_official_usd ?? 0)],
                [
                  t('Official cost per $1 charged'),
                  officialPerUSD > 0 ? fmt.usd(officialPerUSD) : '-',
                ],
                [
                  t('Charged per $1 official cost'),
                  officialPerUSD > 0 ? fmt.usd(1 / officialPerUSD) : '-',
                ],
              ].map(([label, value]) => (
                <div key={label} className='flex justify-between gap-2'>
                  <dt className='text-muted-foreground'>{label}</dt>
                  <dd className='tabular-nums'>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
        <Panel
          className='lg:col-span-2'
          title={t('What one account is worth')}
          help={t(
            'A full week of one account at official prices, as corecode-engine calibrated it from the account’s own requests: the median of the plan’s measured accounts, with the smallest and largest. The new-api columns divide it by this range’s official cost per $1 charged; a month is 30/7 weeks.'
          )}
        >
          {data?.plans_error && (
            <p className='text-destructive mb-2 text-sm'>{data.plans_error}</p>
          )}
          <SimpleTable
            rows={data?.plans}
            rowKey={(row) => `${row.plan}/${row.tier}`}
            empty={t('No account has a measured weekly capacity')}
            columns={[
              {
                key: 'plan',
                label: t('Plan'),
                render: (row) => (
                  <span>
                    {row.plan || '-'}
                    {row.tier && (
                      <span className='text-muted-foreground ml-1 text-xs'>
                        {row.tier}
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'accounts',
                label: t('Measured accounts'),
                align: 'right',
                render: (row) => `${row.measured} / ${row.accounts}`,
              },
              {
                key: 'week',
                label: t('Official value per week'),
                align: 'right',
                render: (row) => {
                  const low = fmt.usdWhole(row.week_low_usd)
                  const high = fmt.usdWhole(row.week_high_usd)
                  return low === high
                    ? fmt.usd(row.week_usd)
                    : `${fmt.usd(row.week_usd)} (${low}–${high})`
                },
              },
              {
                key: 'charged-week',
                label: t('new-api value per week'),
                align: 'right',
                render: (row) => toCharged(row.week_usd),
              },
              {
                key: 'charged-month',
                label: t('new-api value per month'),
                align: 'right',
                render: (row) => toCharged((row.week_usd * 30) / 7),
              },
            ]}
          />
        </Panel>
      </div>

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
