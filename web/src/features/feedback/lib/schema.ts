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

import { FEEDBACK_CATEGORIES } from '../constants'

const CATEGORY_VALUES: ReadonlySet<string> = new Set(FEEDBACK_CATEGORIES)

// Limits match controller/feedback.go, which enforces them again.
export const feedbackSchema = z.object({
  category: z.string().refine((value) => CATEGORY_VALUES.has(value), {
    message: 'Please choose a type',
  }),
  title: z
    .string()
    .trim()
    .min(1, 'Please enter a title')
    .max(128, 'This field is too long'),
  description: z
    .string()
    .trim()
    .min(1, 'Please describe the problem')
    .max(4000, 'This field is too long'),
  related_request: z.string().trim().max(128, 'This field is too long'),
  contact: z.string().trim().max(128, 'This field is too long'),
})

export type FeedbackValues = z.infer<typeof feedbackSchema>
