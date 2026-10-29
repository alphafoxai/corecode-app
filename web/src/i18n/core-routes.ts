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
// The pages most visits land on, by route id. Their first render needs only the
// core part of the locale: scripts/i18n-locale-split-loader.mjs puts in it every
// key that code reachable from these routes (with their layouts, and main.tsx)
// names, and every key no console source names. Other pages wait for the rest
// (src/i18n/config.ts). The loader reads this list as text: keep it a plain
// array of string literals.
export const CORE_ROUTE_IDS = [
  '__root__',
  '/(auth)/sign-in',
  '/_authenticated/dashboard/',
  '/_authenticated/dashboard/$section',
  '/_authenticated/keys/',
  '/(errors)/401',
  '/(errors)/403',
  '/(errors)/404',
  '/(errors)/500',
  '/(errors)/503',
  '/_authenticated/errors/$error',
]

/** Whether a page whose deepest route has this id renders from the core locale. */
export function isCoreRoute(routeId: string | undefined): boolean {
  return routeId !== undefined && CORE_ROUTE_IDS.includes(routeId)
}
