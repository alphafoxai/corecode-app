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
/** Telegram account that answers enterprise pricing questions */
export const ENTERPRISE_TELEGRAM_HANDLE = 'joe_alphafox'

export const ENTERPRISE_TELEGRAM_URL = `https://t.me/${ENTERPRISE_TELEGRAM_HANDLE}`

/**
 * Monthly spend bands, in the order the form lists them. `labelKey` is the
 * i18n key; the backend accepts only these values.
 */
export const ENTERPRISE_SPEND_BANDS = [
  { value: 'under_1k', labelKey: 'Under $1,000' },
  { value: '1k_5k', labelKey: '$1,000 - $5,000' },
  { value: '5k_20k', labelKey: '$5,000 - $20,000' },
  { value: '20k_50k', labelKey: '$20,000 - $50,000' },
  { value: 'over_50k', labelKey: 'Over $50,000' },
] as const

export type EnterpriseSpendBand =
  (typeof ENTERPRISE_SPEND_BANDS)[number]['value']
