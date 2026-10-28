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
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

export const RISK_GATE_STAGES = [
  'distill',
  'hard_regex',
  'refusal_cache',
  'decision',
] as const

export type RiskGateStage = (typeof RISK_GATE_STAGES)[number]
export type RiskGateAction = 'blocked' | 'observed' | 'fail_open'

export type RiskGateSummary = {
  inbound: number
  decision_calls: number
  decision_failures: number
  stages: Array<{ stage: RiskGateStage; action: RiskGateAction; count: number }>
  hits: Array<{ stage: RiskGateStage; rule: string; count: number }>
}

export type RiskGateEvent = {
  id: number
  created_at: number
  stage: RiskGateStage
  rule: string
  action: RiskGateAction
  detail: string
  user_id: number
  username: string
  token_id: number
  model_name: string
  request_id: string
  excerpt: string
}

export type RiskGateRange = {
  start: number
  end: number
}

type RiskGateEventPage = {
  page: number
  page_size: number
  total: number
  items: RiskGateEvent[]
}

export async function getRiskGateSummary(
  range: RiskGateRange
): Promise<RiskGateSummary> {
  const res = await api.get<ApiResponse<RiskGateSummary>>(
    '/api/user/risk_gate/summary',
    { params: range }
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load the risk audit')
  }
  return res.data.data
}

export async function getRiskGateEvents(
  params: RiskGateRange & { p: number; page_size: number; stage?: string }
): Promise<RiskGateEventPage> {
  const res = await api.get<ApiResponse<RiskGateEventPage>>(
    '/api/user/risk_gate/events',
    { params }
  )
  if (!res.data.success || !res.data.data) {
    throw createServerError(res.data, 'Failed to load the risk audit')
  }
  return res.data.data
}
