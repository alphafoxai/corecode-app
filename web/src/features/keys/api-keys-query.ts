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
import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { t } from 'i18next'

import { getStoredPageSize } from '@/hooks/use-table-url-state'
import { createServerError } from '@/lib/server-error-message'

import { getApiKeys, searchApiKeys } from './api'
import { API_KEYS_DEFAULT_PAGE_SIZE, ERROR_MESSAGES } from './constants'

type ApiKeysQuery = {
  page: number
  pageSize: number
  keyword: string | undefined
  token: string
  refreshTrigger: number
}

/** One page of the keys table, searched by name or key when either is set. */
export function apiKeysQueryOptions(query: ApiKeysQuery) {
  const shouldSearch = Boolean(query.keyword?.trim() || query.token.trim())
  return queryOptions({
    queryKey: [
      'keys',
      query.page,
      query.pageSize,
      query.keyword,
      query.token,
      query.refreshTrigger,
    ],
    queryFn: async () => {
      const result = shouldSearch
        ? await searchApiKeys({
            keyword: query.keyword,
            token: query.token,
            p: query.page,
            size: query.pageSize,
          })
        : await getApiKeys({ p: query.page, size: query.pageSize })

      if (!result.success) {
        throw createServerError(
          result,
          t(
            shouldSearch
              ? ERROR_MESSAGES.SEARCH_FAILED
              : ERROR_MESSAGES.LOAD_FAILED
          )
        )
      }

      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    // Fresh for a moment, so the table does not ask again for a page the
    // route's loader (or a hover preload) has just read. A change refetches
    // through refreshTrigger.
    staleTime: 10_000,
  })
}

/**
 * Start the keys table's first request while the keys page renders. The
 * route's loader calls this with the page's search params; the defaults are
 * the ones useTableUrlState gives the table, so the table's query picks up the
 * same request.
 */
export function prefetchApiKeys(
  queryClient: QueryClient,
  search: { page?: number; pageSize?: number; filter?: string; token?: string }
): void {
  void queryClient.prefetchQuery(
    apiKeysQueryOptions({
      page: search.page ?? 1,
      pageSize:
        search.pageSize ?? getStoredPageSize() ?? API_KEYS_DEFAULT_PAGE_SIZE,
      keyword: search.filter ?? '',
      token: search.token?.trim() ? search.token : '',
      refreshTrigger: 0,
    })
  )
}
