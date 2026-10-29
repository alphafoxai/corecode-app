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
// The pages most visits land on, by route id, and the parts of the locale they
// render from. scripts/i18n-locale-split-loader.mjs puts in the boot part every
// key that code reachable from the boot routes (with their layouts, and
// main.tsx) names, and in the core part the keys the core routes' code names
// and every key no console source names. Other pages also wait for the rest
// (src/i18n/config.ts). The loader reads these lists as text: keep them plain
// arrays of string literals.
export const BOOT_ROUTE_IDS = [
  '__root__',
  '/(auth)/sign-in',
  '/(errors)/401',
  '/(errors)/403',
  '/(errors)/404',
  '/(errors)/500',
  '/(errors)/503',
]

export const CORE_ROUTE_IDS = [
  '/_authenticated/dashboard/',
  '/_authenticated/dashboard/$section',
  '/_authenticated/keys/',
  '/_authenticated/errors/$error',
]

/** A locale part beyond the boot part, which i18next loads first. */
export type LocalePart = 'core' | 'rest'

/** The parts a page whose deepest route has this id needs before it renders. */
export function localePartsFor(routeId: string | undefined): LocalePart[] {
  if (routeId !== undefined && BOOT_ROUTE_IDS.includes(routeId)) return []
  if (routeId !== undefined && CORE_ROUTE_IDS.includes(routeId)) return ['core']
  return ['core', 'rest']
}
