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
export type FeedbackCategory = 'bug' | 'suggestion' | 'billing' | 'other'

export type FeedbackStatus = 'pending' | 'processing' | 'resolved' | 'invalid'

export interface Feedback {
  id: number
  user_id: number
  category: FeedbackCategory
  title: string
  description: string
  /** The time or request id the customer points at */
  related_request: string
  contact: string
  /** JSON the server attaches: user agent and the latest usage log entries */
  context: string
  status: FeedbackStatus
  admin_reply: string
  /** Quota granted for the report; 0 means none */
  reward_quota: number
  rewarded_by: number
  rewarded_time: number
  created_time: number
  updated_time: number
}

export interface FeedbackFilters {
  status?: string
  category?: string
  keyword?: string
}

export interface FeedbackPage {
  items: Feedback[]
  total: number
  page: number
  page_size: number
}

export interface FeedbackUpdate {
  status: FeedbackStatus
  admin_reply: string
  /** A one-time reward in US dollars of quota; 0 grants nothing */
  reward_usd: number
}
