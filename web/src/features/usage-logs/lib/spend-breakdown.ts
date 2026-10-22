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
import type { FlowQuotaDataItem } from '@/features/dashboard/types'

export interface SpendRow {
  name: string
  quota: number
  count: number
}

export function summarizeSpend(
  rows: FlowQuotaDataItem[],
  keyOf: (row: FlowQuotaDataItem) => string
): SpendRow[] {
  const totals = new Map<string, SpendRow>()
  for (const row of rows) {
    const name = keyOf(row)
    if (!name) continue
    const entry = totals.get(name) ?? { name, quota: 0, count: 0 }
    entry.quota += Number(row.quota) || 0
    entry.count += Number(row.count) || 0
    totals.set(name, entry)
  }
  return [...totals.values()].sort((a, b) => b.quota - a.quota)
}
