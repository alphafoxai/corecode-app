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
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  PURCHASE_LOOKBACK_SECONDS,
  SIGN_UP_WINDOW_SECONDS,
  trackPurchases,
  trackSignUp,
  useReportPurchases,
} from '../analytics'
import { api } from '../api'

vi.mock('../api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ auth: { user: { id: 7 } } }),
}))

const NOW = 1_800_000_000
const gtag = vi.fn()

function paid(tradeNo: string, overrides = {}) {
  return {
    trade_no: tradeNo,
    money: 9.9,
    status: 'success',
    payment_provider: 'epay',
    complete_time: NOW - 60,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  gtag.mockReset()
  window.gtag = gtag
})

afterEach(() => {
  delete window.gtag
  vi.mocked(api.get).mockReset()
})

describe('trackSignUp', () => {
  test('reports an account created within the window once', () => {
    const user = { id: 1, created_at: NOW - SIGN_UP_WINDOW_SECONDS }
    trackSignUp(user, 'magic_link', NOW)
    trackSignUp(user, 'magic_link', NOW)
    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'sign_up', {
      method: 'magic_link',
    })
  })

  test('treats an older account as a login', () => {
    trackSignUp(
      { id: 1, created_at: NOW - SIGN_UP_WINDOW_SECONDS - 1 },
      'oauth:oidc',
      NOW
    )
    trackSignUp({ id: 2 }, 'oauth:oidc', NOW)
    expect(gtag).not.toHaveBeenCalled()
  })

  test('does nothing without the GA tag', () => {
    delete window.gtag
    trackSignUp({ id: 1, created_at: NOW }, 'magic_link', NOW)
    expect(window.localStorage.length).toBe(0)
  })
})

describe('trackPurchases', () => {
  test('reports a recent paid order once, in CNY', () => {
    trackPurchases([paid('T1')], NOW)
    trackPurchases([paid('T1')], NOW)
    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'purchase', {
      transaction_id: 'T1',
      value: 9.9,
      currency: 'CNY',
    })
  })

  test('skips unpaid, balance-paid, free and old orders', () => {
    trackPurchases(
      [
        paid('pending', { status: 'pending' }),
        paid('balance', { payment_provider: 'balance' }),
        paid('free', { money: 0 }),
        paid('incomplete', { complete_time: undefined }),
        paid('old', { complete_time: NOW - PURCHASE_LOOKBACK_SECONDS - 1 }),
      ],
      NOW
    )
    expect(gtag).not.toHaveBeenCalled()
  })
})

describe('useReportPurchases', () => {
  test('reads the latest orders without the global error handler', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: { items: [paid('T2', { complete_time: undefined })] },
      },
    })
    renderHook(() => useReportPurchases())
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1))
    expect(api.get).toHaveBeenCalledWith('/api/user/topup/self', {
      params: { p: 1, page_size: 10 },
      skipErrorHandler: true,
    })
  })

  test('reports what it finds and swallows a failed request', async () => {
    const recent = paid('T3', { complete_time: Math.floor(Date.now() / 1000) })
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { success: true, data: { items: [recent] } },
    })
    renderHook(() => useReportPurchases())
    await waitFor(() => expect(gtag).toHaveBeenCalledTimes(1))

    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'))
    renderHook(() => useReportPurchases())
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  test('sends no request without the GA tag', () => {
    delete window.gtag
    renderHook(() => useReportPurchases())
    expect(api.get).not.toHaveBeenCalled()
  })
})
