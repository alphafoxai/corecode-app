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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { getInvitees } from './api'
import { InvitationOverview } from './components/invitation-overview'
import type { Invitee } from './types'

const EMPTY: Invitee[] = []
const NO_TOTALS = { used_quota: 0, commission: 0 }

function useInviteeColumns(): ColumnDef<Invitee>[] {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        accessorKey: 'name',
        header: t('Invitee'),
        size: 140,
        meta: { label: t('Invitee'), mobileTitle: true },
      },
      {
        accessorKey: 'created_at',
        header: t('Joined'),
        size: 170,
        cell: ({ row }) => (
          <span className='font-mono tabular-nums'>
            {formatTimestampToDate(row.original.created_at)}
          </span>
        ),
        meta: { label: t('Joined') },
      },
      {
        accessorKey: 'used_quota',
        header: t('Total spend'),
        size: 130,
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatQuota(row.original.used_quota)}
          </span>
        ),
        meta: { label: t('Total spend') },
      },
      {
        accessorKey: 'commission',
        header: t('Commission earned'),
        size: 130,
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            {formatQuota(row.original.commission)}
          </span>
        ),
        meta: { label: t('Commission earned') },
      },
    ],
    [t]
  )
}

export function Invitations() {
  const { t } = useTranslation()
  const columns = useInviteeColumns()
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

  const query = useQuery({
    queryKey: ['affiliate', 'invitees', pagination],
    queryFn: () =>
      getInvitees({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }),
    placeholderData: (previous) => previous,
  })

  const { table } = useDataTable<Invitee>({
    columns,
    data: query.data?.items ?? EMPTY,
    // Invitees carry no id; their place in the newest-first list is stable
    // within a page.
    getRowId: (_row, index) =>
      String(pagination.pageIndex * pagination.pageSize + index),
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
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Invitations')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-3 sm:gap-4'>
          <InvitationOverview
            inviteeCount={query.data?.total ?? 0}
            totals={query.data?.totals ?? NO_TOTALS}
            loading={query.isPending}
          />
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={query.isPending}
            isFetching={query.isFetching}
            emptyTitle={t('No invitees yet')}
            emptyDescription={t(
              'Users who sign up with your link appear here, with what they spend.'
            )}
            toolbarProps={null}
            className='h-auto min-h-0'
            applyHeaderSize
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
