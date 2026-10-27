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
import { useEffect } from 'react'

/**
 * Add `<meta name="robots" content="noindex">` while `active` is true, and
 * remove it when it turns false or the caller unmounts.
 *
 * The server answers every console path with the app shell and status 200,
 * so a "not found" screen is a soft 404 to search engines. Google's guidance
 * for client-rendered apps is to mark such pages noindex from JavaScript
 * (developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
 * Only the tag this hook added is removed, so it never strips one the page
 * shipped with.
 */
export function useNoIndex(active = true) {
  useEffect(() => {
    if (!active) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.append(meta)
    return () => meta.remove()
  }, [active])
}
