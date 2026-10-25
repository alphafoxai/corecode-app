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
