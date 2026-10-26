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
import type { TopupRecord } from '../wallet/types'

/** Filters shared by the record list and the summary. Times are unix seconds. */
export interface TopupReportFilters {
  start_time: number
  end_time: number
  user?: string
  trade_no?: string
  status?: string
  payment_method?: string
}

export interface TopupReportRecord extends TopupRecord {
  username: string
}

export interface TopupDay {
  /** Unix second the day starts at in the browser's time zone */
  day: number
  money: number
  count: number
}

export interface TopupMethodTotal {
  payment_method: string
  money: number
  count: number
}

/** Successful gateway top-ups; orders paid from the wallet are excluded. */
export interface TopupStats {
  money: number
  count: number
  user_count: number
  daily: TopupDay[]
  methods: TopupMethodTotal[]
  /** Every payment method ever used, for the filter */
  payment_methods: string[]
}
