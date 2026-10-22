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
import { describe, expect, test } from 'vitest'

import { getBillingDiscount, getDiscountKind } from '../billing-discount'

describe('getBillingDiscount', () => {
  test('a ¥1-per-$1 recharge at 6.9 and a 2.5× group is about 0.362', () => {
    const discount = getBillingDiscount({
      price: 1,
      usdExchangeRate: 6.9,
      groupRatio: 2.5,
    })
    expect(discount.exchange).toBeCloseTo(0.145, 3)
    expect(discount.group).toBe(2.5)
    expect(discount.combined).toBeCloseTo(0.362, 3)
    expect(getDiscountKind(discount.combined)).toBe('discount')
  })

  test('recharging at the exchange rate leaves only the group ratio', () => {
    const discount = getBillingDiscount({
      price: 7.3,
      usdExchangeRate: 7.3,
      groupRatio: 1.5,
    })
    expect(discount.exchange).toBe(1)
    expect(discount.combined).toBe(1.5)
    expect(getDiscountKind(discount.combined)).toBe('markup')
  })
})

describe('getDiscountKind', () => {
  test('treats a factor that rounds to 1 as parity', () => {
    expect(getDiscountKind(0.998)).toBe('same')
    expect(getDiscountKind(1.004)).toBe('same')
    expect(getDiscountKind(0.99)).toBe('discount')
  })
})
