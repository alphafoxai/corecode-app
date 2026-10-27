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
import type { UserConcurrency } from '../types'

export type ConcurrencyTier = UserConcurrency['tiers'][number]

/** Tiers in ascending order of the amount they need. */
export function sortedConcurrencyTiers(
  info: UserConcurrency | undefined
): ConcurrencyTier[] {
  return [...(info?.tiers ?? [])].sort((a, b) => a.min_paid - b.min_paid)
}

/**
 * The limit a customer would have after paying `amount` more, when that is
 * above their current limit; otherwise null. Mirrors the server: the highest
 * tier reached applies when it is above the group limit.
 */
export function concurrencyAfterPaying(
  info: UserConcurrency | undefined,
  amount: number
): number | null {
  if (!info || info.limit === 0 || info.source === 'user') return null
  let limit = info.limit
  for (const tier of sortedConcurrencyTiers(info)) {
    if (info.paid_total + amount >= tier.min_paid && tier.limit > limit) {
      limit = tier.limit
    }
  }
  return limit > info.limit ? limit : null
}

/** The next tier above the current limit, with what is left to pay. */
export function nextConcurrencyTier(
  info: UserConcurrency | undefined
): (ConcurrencyTier & { remaining: number }) | null {
  if (!info || info.limit === 0 || info.source === 'user') return null
  const next = sortedConcurrencyTiers(info).find(
    (tier) => tier.min_paid > info.paid_total && tier.limit > info.limit
  )
  return next
    ? { ...next, remaining: Math.max(next.min_paid - info.paid_total, 0) }
    : null
}
