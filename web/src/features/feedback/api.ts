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

import type { FeedbackValues } from './lib/schema'
import type {
  Feedback,
  FeedbackFilters,
  FeedbackPage,
  FeedbackUpdate,
} from './types'

type Envelope<T> = { success: boolean; message?: string; data?: T }
type PageParams = { p: number; page_size: number }

export async function submitFeedback(values: FeedbackValues): Promise<void> {
  const res = await api.post<Envelope<null>>('/api/feedback', values)
  if (!res.data.success) {
    throw createServerError(res.data, 'Failed to submit feedback')
  }
}

export async function getMyFeedback(page: PageParams): Promise<FeedbackPage> {
  const res = await api.get<Envelope<FeedbackPage>>('/api/feedback/self', {
    params: page,
  })
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load feedback')
  }
  return res.data.data
}

export async function getAllFeedback(
  filters: FeedbackFilters,
  page: PageParams
): Promise<FeedbackPage> {
  const res = await api.get<Envelope<FeedbackPage>>('/api/feedback/admin', {
    params: { ...filters, ...page },
  })
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load feedback')
  }
  return res.data.data
}

export async function updateFeedback(
  id: number,
  update: FeedbackUpdate
): Promise<Feedback> {
  const res = await api.patch<Envelope<Feedback>>(
    `/api/feedback/admin/${id}`,
    update
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to update feedback')
  }
  return res.data.data
}
