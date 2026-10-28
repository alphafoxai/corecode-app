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
import type { ApiResponse } from '@/features/profile/types'
import type {
  AffiliatePage,
  AffiliateTier,
  AffiliateWithdrawal,
  AffiliateWithdrawalStatus,
} from '@/features/wallet/types'
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

export type AdminWithdrawal = AffiliateWithdrawal & { username: string }

export type WithdrawalFilter = AffiliateWithdrawalStatus | ''

export async function getAdminWithdrawals(params: {
  status: WithdrawalFilter
  p: number
  page_size: number
}): Promise<AffiliatePage<AdminWithdrawal>> {
  const res = await api.get<ApiResponse<AffiliatePage<AdminWithdrawal>>>(
    '/api/affiliate/admin/withdrawals',
    { params: { ...params, status: params.status || undefined } }
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load withdrawals')
  }
  return res.data.data
}

export async function processWithdrawal(
  id: number,
  action: 'pay' | 'reject',
  note: string
): Promise<AdminWithdrawal> {
  const res = await api.post<ApiResponse<AdminWithdrawal>>(
    `/api/affiliate/admin/withdrawals/${id}/${action}`,
    note ? { note } : {}
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to process the withdrawal')
  }
  return res.data.data
}

/** One user on the invitation page: an affiliate, or an inviter without one */
export interface AffiliateListItem {
  user_id: number
  username: string
  display_name: string
  email: string
  status: number
  aff_code: string
  /** False for a user who invited people before they had an affiliate row */
  has_affiliate: boolean
  rate: number
  channel: boolean
  tier: AffiliateTier
  invitee_count: number
  /** Quota units */
  balance: number
  /** Quota units */
  earned: number
}

export type AffiliateListType =
  | ''
  | 'channel'
  | 'retail'
  | 'distributor'
  | 'inviting'
  | 'revoked'
export type AffiliateListSort = 'invitees' | 'earned' | 'recent'

export async function getAffiliates(params: {
  keyword: string
  type: AffiliateListType
  sort: AffiliateListSort
  p: number
  page_size: number
}): Promise<AffiliatePage<AffiliateListItem>> {
  const res = await api.get<ApiResponse<AffiliatePage<AffiliateListItem>>>(
    '/api/affiliate/admin/affiliates',
    {
      params: {
        ...params,
        keyword: params.keyword || undefined,
        type: params.type || undefined,
      },
    }
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load affiliates')
  }
  return res.data.data
}

/** GET /api/affiliate/admin/overview. Amounts are quota units. */
export interface AffiliateOverview {
  overview: {
    /** Users with at least one invitee */
    inviters: number
    channels: number
    invitees: number
    earned: number
    balance: number
    pending_withdrawals: number
    pending_withdrawal_quota: number
    /** Sign-up gifts given in the last 24 hours */
    signup_gifts: number
    /** Sign-up gifts a limit withheld in the last 24 hours */
    signup_gifts_withheld: number
  }
  earned_money: number
  balance_money: number
  pending_withdrawal_money: number
  enabled: boolean
  self_serve_rate: number
  max_rate: number
  second_level_rate: number
}

export async function getAffiliateOverview(): Promise<AffiliateOverview> {
  const res = await api.get<ApiResponse<AffiliateOverview>>(
    '/api/affiliate/admin/overview'
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load the invitation overview')
  }
  return res.data.data
}
