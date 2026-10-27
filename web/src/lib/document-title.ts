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
// The tab title is `<page> · <site>`, or the site name alone. main.tsx sets the
// site name from /api/status, cache first and again after the network refresh,
// which can land after a page has set its own part; keeping the two parts here
// means neither overwrites the other.
let site = typeof document === 'undefined' ? '' : document.title
let page: string | undefined

function render() {
  document.title = page && site ? `${page} · ${site}` : page || site
}

export function setSiteTitle(name: string) {
  site = name
  render()
}

export function setPageTitle(title: string | undefined) {
  page = title || undefined
  render()
}
