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

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { useInsightsFormat } from '../lib'
import type { FinanceInsights } from '../types'
import { ClaudeEconomics, Figure } from './claude-economics'
import { BarSeries, Panel, SimpleTable } from './shared'

/**
 * The vendors the server splits new-api's charge by (model.ModelVendor),
 * in the order shown. Only Claude has accounts whose cost is counted.
 */
const VENDORS = [
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
  { key: 'grok', label: 'Grok' },
  { key: 'gemini', label: 'Gemini' },
] as const

const OTHER = 'other'

/** new-api's charge by vendor, a tab each; Claude's tab adds what it costs. */
export function VendorTabs(props: { data: FinanceInsights | undefined }) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const [vendor, setVendor] = useState<string>('claude')
  const models = props.data?.vendor_models ?? []
  const totals = new Map<string, { usd: number; requests: number }>()
  for (const model of models) {
    const total = totals.get(model.vendor) ?? { usd: 0, requests: 0 }
    total.usd += model.usd
    total.requests += model.requests
    totals.set(model.vendor, total)
  }
  // An unrecognised model gets a tab only when it was charged for.
  const tabs = [
    ...VENDORS,
    ...((totals.get(OTHER)?.usd ?? 0) > 0
      ? [{ key: OTHER, label: t('Other models') }]
      : []),
  ]

  return (
    <Tabs value={vendor} onValueChange={(value) => setVendor(String(value))}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-semibold'>
          {t('Usage and cost by vendor')}
        </h2>
        <TabsList className='h-auto'>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className='gap-2 px-3'>
              {tab.label}
              {props.data?.vendor_models && (
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {fmt.usdWhole(totals.get(tab.key)?.usd ?? 0)}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value='claude' className='grid gap-4 pt-2'>
        <ClaudeEconomics data={props.data} />
      </TabsContent>
      {tabs
        .filter((tab) => tab.key !== 'claude')
        .map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className='pt-2'>
            <VendorCharge
              data={props.data}
              vendor={tab.key}
              label={tab.label}
            />
          </TabsContent>
        ))}
    </Tabs>
  )
}

/**
 * What new-api charged for one vendor's models. No account cost is counted
 * for these vendors yet, so there is no ratio against one.
 */
function VendorCharge(props: {
  data: FinanceInsights | undefined
  vendor: string
  label: string
}) {
  const { t } = useTranslation()
  const fmt = useInsightsFormat()
  const all = props.data?.vendor_models ?? []
  const models = all.filter((model) => model.vendor === props.vendor)
  const usd = models.reduce((sum, model) => sum + model.usd, 0)
  const requests = models.reduce((sum, model) => sum + model.requests, 0)
  const allUSD = all.reduce((sum, model) => sum + model.usd, 0)
  const daily = props.data?.daily ?? []

  return (
    <Panel
      title={t('{{vendor}}: new-api usage', { vendor: props.label })}
      help={t(
        'What new-api deducted for this vendor’s models at its own ratios, root included, gifted and paid balance alike. A model belongs to a vendor by its name: claude-, gpt- and codex-, grok-, gemini-. No account cost is counted for this vendor yet.'
      )}
    >
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <Figure
          loading={!props.data}
          dot='bg-primary'
          label={t('new-api charge')}
          value={fmt.usd(usd)}
        />
        <Figure
          loading={!props.data}
          label={t('Requests')}
          value={fmt.num(requests)}
        />
        <Figure
          loading={!props.data}
          label={t('Charge per request')}
          value={requests > 0 ? fmt.usd(usd / requests) : '-'}
        />
        <Figure
          loading={!props.data}
          label={t('Share of all new-api charge')}
          value={allUSD > 0 ? fmt.pct(usd / allUSD) : '-'}
        />
      </div>
      <div className='mt-4 border-t pt-4'>
        <BarSeries
          ariaLabel={t('Daily {{vendor}} charge', { vendor: props.label })}
          series={[
            {
              label: t('new-api charge'),
              format: fmt.usd,
              compact: fmt.usdCompact,
            },
          ]}
          points={daily.map((day) => ({
            key: day.day,
            title: fmt.day(day.day),
            values: [day.vendor_usd?.[props.vendor] ?? 0],
          }))}
        />
      </div>
      <div className='mt-4 border-t pt-2'>
        <SimpleTable
          rows={models}
          rowKey={(row) => row.model}
          empty={t('No charge for this vendor in this range')}
          columns={[
            {
              key: 'model',
              label: t('Model'),
              render: (row) => row.model,
            },
            {
              key: 'requests',
              label: t('Requests'),
              align: 'right',
              render: (row) => fmt.num(row.requests),
            },
            {
              key: 'per',
              label: t('Charge per request'),
              align: 'right',
              render: (row) =>
                row.requests > 0 ? fmt.usd(row.usd / row.requests) : '-',
            },
            {
              key: 'usd',
              label: t('new-api charge'),
              align: 'right',
              render: (row) => fmt.usd(row.usd),
            },
            {
              key: 'share',
              label: t('Share'),
              align: 'right',
              render: (row) => (usd > 0 ? fmt.pct(row.usd / usd) : '-'),
            },
          ]}
        />
      </div>
    </Panel>
  )
}
