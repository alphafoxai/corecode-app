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
import { Check, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import { EXCLUDED_GROUPS } from '../constants'
import { getBillingDiscount, getDiscountKind } from '../lib/billing-discount'
import { getConfiguredGroupRatio } from '../lib/model-helpers'
import {
  formatYuan,
  getBaseUnitPrices,
  UNIT_PRICE_KEYS,
  type BaseUnitPrices,
  type UnitPriceKey,
} from '../lib/unit-prices'
import type { PricingModel } from '../types'
import { BillingExplainer } from './billing-explainer'

const COLUMN_LABEL: Record<UnitPriceKey, string> = {
  input: 'Input price',
  output: 'Output price',
  cacheWrite: 'Cache Creation',
  cacheRead: 'Cache Read',
}

type PriceMode = 'group' | 'official'

const PRESSED =
  'aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:aria-pressed:bg-primary/90'

function trimNumber(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)))
}

/** Groups any listed model is enabled in, cheapest first. */
function listGroups(
  models: PricingModel[],
  groupRatio: Record<string, number>,
  usableGroup: Record<string, unknown>
): string[] {
  const names = new Set<string>()
  for (const model of models) {
    for (const group of model.enable_groups ?? []) {
      if (!EXCLUDED_GROUPS.includes(group) && group in usableGroup) {
        names.add(group)
      }
    }
  }
  return [...names].sort(
    (a, b) =>
      getConfiguredGroupRatio(groupRatio, a) -
      getConfiguredGroupRatio(groupRatio, b)
  )
}

function groupDescription(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'desc' in value) {
    return String((value as { desc: unknown }).desc ?? '')
  }
  return ''
}

/**
 * CoreCode fork: the model square as a price list. Each model's four Claude
 * Code prices in CNY at the chosen group, the official price struck through
 * beside them, and the share saved. Every figure comes from the live recharge
 * price, exchange rate and group ratios.
 */
export function PriceBoard(props: {
  models: PricingModel[]
  groupRatio: Record<string, number>
  usableGroup: Record<string, unknown>
  priceRate: number
  usdExchangeRate: number
  onModelClick: (modelName: string) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<PriceMode>('group')
  const groups = listGroups(props.models, props.groupRatio, props.usableGroup)
  const [selected, setSelected] = useState<string | null>(null)
  const group = selected && groups.includes(selected) ? selected : groups[0]
  const ratio = group ? getConfiguredGroupRatio(props.groupRatio, group) : 1

  const discountAt = (groupRatio: number) =>
    getBillingDiscount({
      price: props.priceRate,
      usdExchangeRate: props.usdExchangeRate,
      groupRatio,
    }).combined
  const discountLabel = (combined: number) =>
    t('{{tenths}} of official price', {
      tenths: trimNumber(combined * 10, 1),
      percent: `${Math.round(combined * 100)}%`,
    })
  const combined = discountAt(ratio)
  const saving = getDiscountKind(combined) === 'discount' ? 1 - combined : 0

  const rows = props.models
    .filter((model) => !group || (model.enable_groups ?? []).includes(group))
    .map((model) => ({ model, base: getBaseUnitPrices(model) }))
    .filter((row): row is { model: PricingModel; base: BaseUnitPrices } =>
      Boolean(row.base)
    )
    .sort((a, b) => b.base.prices.input - a.base.prices.input)

  const groupYuan = (usd: number) => usd * ratio * props.priceRate
  const officialYuan = (usd: number) => usd * props.usdExchangeRate
  const description = group ? groupDescription(props.usableGroup[group]) : ''

  const renderPrice = (usd: number) => {
    if (!Number.isFinite(usd)) {
      return <span className='text-muted-foreground'>—</span>
    }
    const main = mode === 'group' ? groupYuan(usd) : officialYuan(usd)
    return (
      <>
        <span className='font-mono font-semibold tabular-nums'>
          <span className={cn(mode === 'group' && 'text-primary')}>
            {formatYuan(main)}
          </span>
          <span className='text-muted-foreground text-xs font-normal'>
            {' '}
            / 1M tokens
          </span>
        </span>
        {mode === 'group' && (
          <span className='text-muted-foreground block font-mono text-xs tabular-nums line-through'>
            {t('Official {{price}}', {
              price: formatYuan(officialYuan(usd)),
            })}
          </span>
        )}
      </>
    )
  }
  const savingChip =
    saving > 0 ? (
      <span className='inline-flex shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400'>
        {t('Save {{percent}}', {
          percent: `${Math.round(saving * 100)}%`,
        })}
      </span>
    ) : (
      <span className='text-muted-foreground'>—</span>
    )
  const modelName = (model: PricingModel) => (
    <span className='flex min-w-0 items-center gap-1'>
      <button
        type='button'
        onClick={() => props.onModelClick(model.model_name)}
        className='hover:text-primary truncate font-mono font-medium underline-offset-4 hover:underline'
      >
        {model.model_name}
      </button>
      <CopyButton
        value={model.model_name}
        tooltip={t('Copy model name')}
        className='size-6'
        iconClassName='size-3'
      />
    </span>
  )
  const tierNote = (
    <span className='text-muted-foreground mt-0.5 block text-xs'>
      {t('Base tier; longer contexts cost more')}
    </span>
  )

  return (
    <div className='flex flex-col gap-4'>
      <section className='bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm'>
        <span className='flex items-center gap-1.5 font-medium'>
          <ReceiptText className='text-primary size-4' aria-hidden />
          {t('Pricing rules')}
        </span>
        <span className='text-muted-foreground'>
          {t('Official prices are converted at $1 = ¥{{rate}}', {
            rate: trimNumber(props.usdExchangeRate, 2),
          })}
        </span>
        <span className='text-muted-foreground'>
          {t('¥{{price}} recharged buys $1 of credit', {
            price: trimNumber(props.priceRate, 2),
          })}
        </span>
        <span className='ml-auto'>
          <BillingExplainer
            models={props.models}
            priceRate={props.priceRate}
            usdExchangeRate={props.usdExchangeRate}
            selectedGroup={group}
          />
        </span>
      </section>

      <section className='bg-card rounded-xl border'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3'>
          <div className='min-w-0'>
            <h2 className='text-base font-semibold'>{t('Price list')}</h2>
            <p className='text-muted-foreground text-xs'>
              {t('Pick a group to see what each model costs in CNY.')}
            </p>
          </div>
          <ToggleGroup
            value={[mode]}
            onValueChange={(values) => {
              if (values[0] === 'group' || values[0] === 'official') {
                setMode(values[0])
              }
            }}
            variant='outline'
            size='sm'
            aria-label={t('Price display mode')}
          >
            <ToggleGroupItem value='group' className={PRESSED}>
              {t('Group price')}
            </ToggleGroupItem>
            <ToggleGroupItem value='official' className={PRESSED}>
              {t('Official price')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className='flex flex-col gap-3 p-4'>
          {groups.length > 0 && (
            <div
              role='radiogroup'
              aria-label={t('Group')}
              className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
            >
              {groups.map((name) => {
                const groupRatio = getConfiguredGroupRatio(
                  props.groupRatio,
                  name
                )
                const groupCombined = discountAt(groupRatio)
                const isDiscount = getDiscountKind(groupCombined) === 'discount'
                const active = name === group
                return (
                  <button
                    key={name}
                    type='button'
                    role='radio'
                    aria-checked={active}
                    onClick={() => setSelected(name)}
                    className={cn(
                      'hover:border-primary/50 flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      active && 'border-primary bg-primary/5'
                    )}
                  >
                    <span className='flex min-w-0 items-center gap-2'>
                      <span className='truncate font-medium'>{name}</span>
                      {isDiscount && (
                        <span className='bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold'>
                          {discountLabel(groupCombined)}
                        </span>
                      )}
                      {active && (
                        <Check
                          className='text-primary ml-auto size-4 shrink-0'
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {t('{{ratio}}x ratio', {
                        ratio: trimNumber(groupRatio, 2),
                      })}
                      {isDiscount &&
                        ` · ${t('About {{discount}}', {
                          discount: discountLabel(groupCombined),
                        })}`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {description && (
            <p className='border-primary/20 bg-primary/5 rounded-lg border px-3 py-2 text-sm'>
              <span className='text-primary font-medium'>
                {t('Group description')}：
              </span>
              {description}
            </p>
          )}

          <ul className='flex flex-col gap-3 md:hidden'>
            {rows.map(({ model, base }) => (
              <li key={model.model_name} className='rounded-lg border p-3'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    {modelName(model)}
                    {base.tiered && tierNote}
                  </div>
                  {mode === 'group' && savingChip}
                </div>
                <dl className='mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5'>
                  {UNIT_PRICE_KEYS.map((key) => (
                    <div key={key} className='min-w-0'>
                      <dt className='text-muted-foreground text-xs'>
                        {t(COLUMN_LABEL[key])}
                      </dt>
                      <dd className='text-sm'>
                        {renderPrice(base.prices[key])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          <div className='hidden overflow-x-auto rounded-lg border md:block'>
            <table className='w-full min-w-[720px] text-sm'>
              <thead className='bg-muted/40 text-muted-foreground text-xs'>
                <tr>
                  <th scope='col' className='px-4 py-2.5 text-left font-medium'>
                    {t('Model')}
                  </th>
                  {UNIT_PRICE_KEYS.map((key) => (
                    <th
                      key={key}
                      scope='col'
                      className='px-3 py-2.5 text-left font-medium'
                    >
                      {t(COLUMN_LABEL[key])}
                    </th>
                  ))}
                  {mode === 'group' && (
                    <th
                      scope='col'
                      className='px-4 py-2.5 text-right font-medium'
                    >
                      {t('Savings')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className='divide-y'>
                {rows.map(({ model, base }) => (
                  <tr key={model.model_name} className='hover:bg-muted/30'>
                    <th scope='row' className='px-4 py-3 text-left font-normal'>
                      {modelName(model)}
                      {base.tiered && tierNote}
                    </th>
                    {UNIT_PRICE_KEYS.map((key) => (
                      <td
                        key={key}
                        className='px-3 py-3 align-top whitespace-nowrap'
                      >
                        {renderPrice(base.prices[key])}
                      </td>
                    ))}
                    {mode === 'group' && (
                      <td className='px-4 py-3 text-right'>{savingChip}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
