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
  EnterpriseApplicationFilters,
  EnterpriseApplicationPage,
  EnterpriseApplicationStatus,
} from './types'

type Envelope<T> = { success: boolean; message?: string; data?: T }

export async function getEnterpriseApplications(
  filters: EnterpriseApplicationFilters,
  page: { p: number; page_size: number }
): Promise<EnterpriseApplicationPage> {
  const res = await api.get<Envelope<EnterpriseApplicationPage>>(
    '/api/enterprise/applications',
    { params: { ...filters, ...page } }
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load applications')
  }
  return res.data.data
}

export async function updateEnterpriseApplication(
  id: number,
  update: { status: EnterpriseApplicationStatus; admin_note: string }
): Promise<void> {
  const res = await api.patch<Envelope<null>>(
    `/api/enterprise/applications/${id}`,
    update
  )
  if (!res.data.success) {
    throw createServerError(res.data, 'Failed to update application')
  }
}
