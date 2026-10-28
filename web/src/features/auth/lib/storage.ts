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
/**
 * Utilities for managing authentication-related browser storage
 */

// ============================================================================
// LocalStorage Keys
// ============================================================================

/** The server rejects invitation codes longer than this. */
export const AFFILIATE_CODE_MAX_LENGTH = 32

const STORAGE_KEYS = {
  AFFILIATE: 'aff',
  STATUS: 'status',
} as const

// ============================================================================
// Affiliate Code Storage
// ============================================================================

/**
 * Get affiliate code from localStorage
 */
export function getAffiliateCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEYS.AFFILIATE) ?? ''
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to get affiliate code:', error)
    return ''
  }
}

/**
 * Save affiliate code to localStorage
 */
export function saveAffiliateCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS.AFFILIATE, code)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save affiliate code:', error)
  }
}

/**
 * Store the invitation code in the address, if any, and return the code now saved.
 * Links carry it as `?aff=`, or as `?ref=` from channels that use that name;
 * `aff` wins when both are present.
 * Safe to call on every render path: it only writes when the address has a code.
 */
export function captureAffiliateCodeFromUrl(search: string): string {
  const params = new URLSearchParams(search)
  const aff = params.get('aff')?.trim() || params.get('ref')?.trim()
  if (aff) saveAffiliateCode(aff.slice(0, AFFILIATE_CODE_MAX_LENGTH))
  return getAffiliateCode()
}
