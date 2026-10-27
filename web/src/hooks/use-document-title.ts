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

import { setPageTitle } from '@/lib/document-title'

/**
 * Title the browser tab `title · <site name>` while the calling page is
 * mounted, and go back to the site name alone when it unmounts. An empty
 * `title` leaves the site name, so a page can pass one once its data loads.
 */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    setPageTitle(title)
    return () => setPageTitle(undefined)
  }, [title])
}
