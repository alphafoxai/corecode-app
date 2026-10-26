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
export type EnterpriseApplicationStatus =
  | 'pending'
  | 'contacted'
  | 'won'
  | 'rejected'

export interface EnterpriseApplication {
  id: number
  company: string
  contact_name: string
  email: string
  other_contact: string
  monthly_spend: string
  use_case: string
  message: string
  /** The signed-in submitter, or 0 for a visitor */
  user_id: number
  ip: string
  status: EnterpriseApplicationStatus
  admin_note: string
  created_time: number
  updated_time: number
}

export interface EnterpriseApplicationFilters {
  status?: string
  keyword?: string
}

export interface EnterpriseApplicationPage {
  items: EnterpriseApplication[]
  total: number
  page: number
  page_size: number
}
