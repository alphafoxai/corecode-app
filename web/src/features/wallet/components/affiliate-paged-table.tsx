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
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useState, type ReactNode } from 'react'

import { DataTablePage, useDataTable } from '@/components/data-table'

import type { AffiliatePage } from '../types'

type AffiliatePagedTableProps<
  T extends { id: number },
  P extends AffiliatePage<T>,
> = {
  queryKey: readonly unknown[]
  load: (params: { p: number; page_size: number }) => Promise<P>
  columns: ColumnDef<T>[]
  emptyTitle: string
  enabled?: boolean
  /** Rendered above the table from the same response, such as its totals */
  summary?: (page: P | undefined, loading: boolean) => ReactNode
}

const EMPTY: never[] = []

// One paged list for commission and withdrawal records, used by the wallet and
// by the admin dialog.
export function AffiliatePagedTable<
  T extends { id: number },
  P extends AffiliatePage<T> = AffiliatePage<T>,
>(props: AffiliatePagedTableProps<T, P>) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const query = useQuery({
    queryKey: [...props.queryKey, pagination],
    queryFn: () =>
      props.load({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }),
    enabled: props.enabled ?? true,
  })

  const { table } = useDataTable<T>({
    columns: props.columns,
    data: query.data?.items ?? (EMPTY as T[]),
    getRowId: (row) => String(row.id),
    totalCount: query.data?.total ?? 0,
    pagination,
    onPaginationChange: (updater) =>
      setPagination((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater
        return next.pageSize === previous.pageSize
          ? next
          : { pageIndex: 0, pageSize: next.pageSize }
      }),
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })

  return (
    <>
      {props.summary?.(query.data, query.isPending)}
      <DataTablePage
        table={table}
        columns={props.columns}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        emptyTitle={props.emptyTitle}
        toolbarProps={null}
        hideMobile
        className='h-auto min-h-0'
        applyHeaderSize
        // Rendered inside dialogs, so the pagination stays with the table
        // instead of moving to the page footer behind the overlay.
        paginationInFooter={false}
      />
    </>
  )
}
