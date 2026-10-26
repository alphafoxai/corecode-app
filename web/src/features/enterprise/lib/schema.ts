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
import { z } from 'zod'

import { ENTERPRISE_SPEND_BANDS } from '../constants'

const SPEND_VALUES: ReadonlySet<string> = new Set(
  ENTERPRISE_SPEND_BANDS.map((band) => band.value)
)

// Limits match controller/enterprise.go, which enforces them again.
export const enterpriseApplicationSchema = z.object({
  company: z
    .string()
    .trim()
    .min(1, 'Please enter your company name')
    .max(128, 'This field is too long'),
  contact_name: z
    .string()
    .trim()
    .min(1, 'Please enter a contact name')
    .max(64, 'This field is too long'),
  email: z
    .string()
    .trim()
    .min(1, 'Please enter your email')
    .max(254, 'This field is too long')
    .pipe(z.email('Invalid email address')),
  other_contact: z.string().trim().max(128, 'This field is too long'),
  monthly_spend: z.string().refine((value) => SPEND_VALUES.has(value), {
    message: 'Please choose your estimated monthly spend',
  }),
  use_case: z.string().trim().max(2000, 'This field is too long'),
  message: z.string().trim().max(2000, 'This field is too long'),
})

export type EnterpriseApplicationValues = z.infer<
  typeof enterpriseApplicationSchema
>
