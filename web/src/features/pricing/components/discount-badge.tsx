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

import {
  getBillingDiscount,
  getDiscountKind,
  getOfficialPriceMarkup,
  hasMarkup,
} from '../lib/billing-discount'
import { getDisplayGroupRatio } from '../lib/model-helpers'
import type { PricingModel } from '../types'

/**
 * "≈2.2折" next to a model: what the viewer pays against the official price
 * at the group the card prices use, after the model's own markup. Renders
 * nothing unless it is a discount, so a markup never becomes a badge.
 */
export function DiscountBadge(props: {
  model: PricingModel
  priceRate: number
  usdExchangeRate: number
  selectedGroup?: string
  className?: string
}) {
  const { t } = useTranslation()
  const markup = getOfficialPriceMarkup(props.model)
  const { combined } = getBillingDiscount({
    price: props.priceRate,
    usdExchangeRate: props.usdExchangeRate,
    groupRatio: getDisplayGroupRatio(props.model, props.selectedGroup),
    markup,
  })
  if (getDiscountKind(combined) !== 'discount') return null

  return (
    <span
      title={
        hasMarkup(markup)
          ? t(
              'This model costs more to serve, so it is priced at {{markup}}× the official price before the group discount.',
              { markup: String(Number(markup.toFixed(2))) }
            )
          : t('Compared with the official price')
      }
      className={cn(
        'border-primary/30 bg-primary/10 text-primary inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums',
        props.className
      )}
    >
      {t('≈{{tenths}} of official price', {
        tenths: String(Number((combined * 10).toFixed(1))),
        percent: `${Math.round(combined * 100)}%`,
      })}
    </span>
  )
}
