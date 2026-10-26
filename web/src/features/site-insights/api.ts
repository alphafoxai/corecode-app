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

import type { ApiResponse } from '../wallet/types'
import type {
  ActivityInsights,
  BusinessInsights,
  CapacityInsights,
  FinanceInsights,
  GrowthInsights,
  InsightsRange,
  QualityInsights,
  RiskInsights,
} from './types'

export type InsightsView =
  | 'capacity'
  | 'finance'
  | 'risk'
  | 'growth'
  | 'activity'
  | 'quality'
  | 'business'

export type InsightsByView = {
  capacity: CapacityInsights
  finance: FinanceInsights
  risk: RiskInsights
  growth: GrowthInsights
  activity: ActivityInsights
  quality: QualityInsights
  business: BusinessInsights
}

/** The longest range, in days, each view's endpoint accepts. */
export const VIEW_MAX_DAYS: Record<InsightsView, number> = {
  capacity: 31,
  finance: 366,
  risk: 92,
  growth: 366,
  activity: 366,
  quality: 31,
  business: 31,
}

export async function getInsights<V extends InsightsView>(
  view: V,
  range: InsightsRange
): Promise<InsightsByView[V]> {
  const res = await api.get<ApiResponse<InsightsByView[V]>>(
    `/api/site-insights/${view}`,
    {
      params: {
        ...range,
        // Minutes east of UTC, so days split at the viewer's midnight.
        tz_offset: -new Date().getTimezoneOffset(),
      },
    }
  )
  if (!res.data.success || res.data.data === undefined) {
    throw createServerError(res.data, 'Failed to load site insights')
  }
  return res.data.data
}
