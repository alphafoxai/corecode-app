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
import { safeJsonParseWithValidation } from '../utils/json-parser'
import { isObjectRecord } from '../utils/json-validators'

// payment_setting.amount_bonus is a JSON object of recharge amount to bonus
// fraction ({"300":0.05}). Operators work in percent; the option stores the
// fraction the server validates (above 0, at most 1).

export type AmountBonusData = {
  amount: number
  /** Bonus as a fraction of the top-up amount (0.05 = 5%) */
  rate: number
}

export function percentToRate(percent: number): number {
  return Number((percent / 100).toFixed(4))
}

export function rateToPercent(rate: number): number {
  return Number((rate * 100).toFixed(2))
}

function parseBonusObject(value: string): Record<string, unknown> {
  return safeJsonParseWithValidation<Record<string, unknown>>(value, {
    fallback: {},
    validator: isObjectRecord,
    silent: true,
  })
}

export function parseBonusTiers(value: string): AmountBonusData[] {
  return Object.entries(parseBonusObject(value))
    .map(([amount, rate]) => ({
      amount: Number.parseInt(amount, 10),
      rate: typeof rate === 'number' ? rate : Number.parseFloat(String(rate)),
    }))
    .filter((tier) => !Number.isNaN(tier.amount) && !Number.isNaN(tier.rate))
    .sort((a, b) => a.amount - b.amount)
}

/**
 * Add a tier, or replace the one being edited (`previousAmount`) when the
 * amount changed.
 */
export function upsertBonusTier(
  value: string,
  data: AmountBonusData,
  previousAmount?: number
): string {
  const tiers = parseBonusObject(value)
  if (previousAmount !== undefined && previousAmount !== data.amount) {
    delete tiers[previousAmount.toString()]
  }
  tiers[data.amount.toString()] = data.rate
  return JSON.stringify(tiers, null, 2)
}

export function removeBonusTier(value: string, amount: number): string {
  const tiers = parseBonusObject(value)
  delete tiers[amount.toString()]
  return JSON.stringify(tiers, null, 2)
}
