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

/**
 * What a customer pays relative to the provider's official price, split into
 * the two factors the model square explains.
 *
 * `price` is what the customer recharges, in CNY, for $1 of credit;
 * `usdExchangeRate` is the reference CNY per USD. Their quotient is the
 * exchange-rate factor. Card prices already include the group ratio, so the
 * combined factor is the two multiplied.
 */
export type BillingDiscount = {
  exchange: number
  group: number
  combined: number
}

export function getBillingDiscount(input: {
  price: number
  usdExchangeRate: number
  groupRatio: number
}): BillingDiscount {
  const exchange = input.price / input.usdExchangeRate
  return {
    exchange,
    group: input.groupRatio,
    combined: exchange * input.groupRatio,
  }
}

/**
 * How the combined factor reads against the official price: a discount
 * below 1, a markup above it, parity within rounding.
 */
export type DiscountKind = 'discount' | 'same' | 'markup'

export function getDiscountKind(combined: number): DiscountKind {
  const rounded = Math.round(combined * 100) / 100
  if (rounded < 1) return 'discount'
  if (rounded > 1) return 'markup'
  return 'same'
}
