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
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

import type {
  AffiliatePageParams,
  AffiliateSummary,
  ApiResponse,
} from '../wallet/types'
import type { InviteePage } from './types'

export async function getInvitees(
  params: AffiliatePageParams
): Promise<InviteePage> {
  const res = await api.get<ApiResponse<InviteePage>>(
    '/api/affiliate/self/invitees',
    { params }
  )
  if (!res.data.success || res.data.data === undefined) {
    throw createServerError(res.data, 'Failed to load invitees')
  }
  return res.data.data
}

/** Replaces the caller's invite code with one they chose. */
export async function updateSelfAffCode(
  affCode: string
): Promise<AffiliateSummary> {
  const res = await api.put<ApiResponse<AffiliateSummary>>(
    '/api/affiliate/self/code',
    { aff_code: affCode }
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to change the invite code')
  }
  return res.data.data
}
