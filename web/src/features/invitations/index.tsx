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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { useAffiliate } from '@/features/wallet/hooks/use-affiliate'

import { getInvitees } from './api'
import { InvitationOverview } from './components/invitation-overview'
import { SecondLevelCard } from './components/second-level-card'
import { useInviteeColumns } from './hooks/use-invitee-columns'
import type { Invitee } from './types'

const EMPTY: Invitee[] = []
const NO_TOTALS = { used_quota: 0, commission_base: 0, commission: 0 }

export function Invitations() {
  const { t } = useTranslation()
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
  const giftPlanTitle = query.data?.gift_plan_title ?? ''
  const columns = useInviteeColumns(giftPlanTitle)
  const aff = useAffiliate()
  const account = aff.summary?.affiliate ?? null
  const secondLevel = query.data?.second_level
  // A distributor earns at the second level; a former one still sees what it
  // earned there, since that is part of its balance.
  const distributor = account?.tier === 'distributor'
  const showSecondLevel =
    secondLevel !== undefined && (distributor || secondLevel.commission > 0)

  const { table } = useDataTable<Invitee>({
    columns,
    data: query.data?.items ?? EMPTY,
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
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Invitations')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-3 sm:gap-4'>
          <InvitationOverview
            inviteeCount={query.data?.total ?? 0}
            totals={query.data?.totals ?? NO_TOTALS}
            loading={query.isPending}
            secondLevel={showSecondLevel}
          />
          {showSecondLevel && (
            <SecondLevelCard
              secondLevel={secondLevel}
              inviteeCount={query.data?.total ?? 0}
              directCommission={query.data?.totals.commission ?? 0}
              directRate={account?.rate ?? 0}
              secondLevelRate={aff.summary?.second_level_rate ?? 0}
              earning={distributor}
            />
          )}
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
