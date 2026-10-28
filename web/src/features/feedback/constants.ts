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
import type { StatusBadgeProps } from '@/components/status-badge'

import type { FeedbackCategory, FeedbackStatus } from './types'

export const MY_FEEDBACK_KEY = ['feedback', 'self'] as const
export const ALL_FEEDBACK_KEY = ['feedback', 'admin'] as const

/** `label` is the i18n key for each category. */
export const FEEDBACK_CATEGORY_CONFIG: Record<
  FeedbackCategory,
  { label: string }
> = {
  bug: { label: 'Bug' },
  suggestion: { label: 'Suggestion' },
  billing: { label: 'Billing issue' },
  other: { label: 'Other' },
}

export const FEEDBACK_CATEGORIES = Object.keys(
  FEEDBACK_CATEGORY_CONFIG
) as FeedbackCategory[]

/** `label` is the i18n key for each status. */
export const FEEDBACK_STATUS_CONFIG: Record<
  FeedbackStatus,
  { label: string; variant: StatusBadgeProps['variant'] }
> = {
  pending: { label: 'Pending', variant: 'warning' },
  processing: { label: 'In progress', variant: 'info' },
  resolved: { label: 'Resolved', variant: 'success' },
  invalid: { label: 'Invalid', variant: 'neutral' },
}

export const FEEDBACK_STATUSES = Object.keys(
  FEEDBACK_STATUS_CONFIG
) as FeedbackStatus[]
