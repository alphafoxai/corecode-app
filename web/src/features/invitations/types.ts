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
import type { AffiliatePage } from '../wallet/types'

/** A user who signed up with the caller's invitation code. */
export interface Invitee {
  id: number
  /** Username */
  name: string
  /** Empty when the account has no email */
  email: string
  created_at: number
  /** Everything the invitee has consumed, in quota */
  used_quota: number
  /**
   * The part of used_quota the commission was paid on: consumption covered
   * by what the invitee paid, in quota
   */
  commission_base: number
  /** Direct commission the invitee's consumption earned the caller, in quota */
  commission: number
  /**
   * The invitee's hold on the gift plan: 'gifted' when an inviter gave it,
   * 'owned' when they got it another way, '' when they can be given it
   */
  gift_plan: '' | 'gifted' | 'owned'
}

export interface InviteeTotals {
  used_quota: number
  commission_base: number
  commission: number
}

/** One of the caller's invitees and the users they invited in turn. */
export interface SecondLevelSource {
  id: number
  /** Username */
  name: string
  /** Users this invitee invited */
  invitee_count: number
  /** Their paid consumption the caller earned second-level commission on */
  commission_base: number
  commission: number
}

/** What the caller earned from the users their invitees invited, in quota */
export interface SecondLevel {
  /** Users the caller's invitees invited, paid or not */
  invitee_count: number
  commission_base: number
  commission: number
  /** Invitees who brought anyone in; sources lists the top ones */
  source_count: number
  sources: SecondLevelSource[]
}

export interface InviteePage extends AffiliatePage<Invitee> {
  totals: InviteeTotals
  /** Only on the caller's own page */
  second_level?: SecondLevel
  /** Title of the plan the caller can gift invitees; empty when gifting is off */
  gift_plan_title: string
}
