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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Gift } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { formatQuota, formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { getInvitees, giftInvitee } from './api'
import { InvitationOverview } from './components/invitation-overview'
import type { Invitee } from './types'

const EMPTY: Invitee[] = []
const NO_TOTALS = { used_quota: 0, commission: 0 }

function useInviteeColumns(
  giftPlanTitle: string,
  onGift: (invitee: Invitee) => void
): ColumnDef<Invitee>[] {
  const { t } = useTranslation()
  return useMemo(() => {
    const columns: ColumnDef<Invitee>[] = [
      {
        accessorKey: 'name',
        header: t('Invitee'),
        size: 200,
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='truncate font-medium'>{row.original.name}</div>
            {row.original.email && (
              <div className='text-muted-foreground truncate text-xs'>
                {row.original.email}
              </div>
            )}
          </div>
        ),
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
    ]
    if (giftPlanTitle) {
      columns.push({
        id: 'gift',
        header: giftPlanTitle,
        size: 130,
        cell: ({ row }) => {
          if (row.original.gift_plan === 'gifted') {
            return <span className='text-muted-foreground'>{t('Gifted')}</span>
          }
          if (row.original.gift_plan === 'owned') {
            return (
              <span className='text-muted-foreground'>
                {t('Already has it')}
              </span>
            )
          }
          return (
            <Button
              size='sm'
              variant='outline'
              onClick={() => onGift(row.original)}
            >
              <Gift />
              {t('Gift')}
            </Button>
          )
        },
        meta: { label: giftPlanTitle },
      })
    }
    return columns
  }, [t, giftPlanTitle, onGift])
}

export function Invitations() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [giftTarget, setGiftTarget] = useState<Invitee | null>(null)

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
  const columns = useInviteeColumns(giftPlanTitle, setGiftTarget)

  const gift = useMutation({
    mutationFn: (invitee: Invitee) => giftInvitee(invitee.id),
    onSuccess: () => {
      toast.success(t('Gave {{plan}}', { plan: giftPlanTitle }))
      setGiftTarget(null)
    },
    onError: (error) => handleServerError(error),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['affiliate', 'invitees'] }),
  })

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
        <ConfirmDialog
          open={giftTarget !== null}
          onOpenChange={(open) => {
            if (!open && !gift.isPending) setGiftTarget(null)
          }}
          title={t('Gift {{plan}}', { plan: giftPlanTitle })}
          desc={t(
            'Give {{user}} the plan {{plan}} for free. Each invitee can receive it once, and cannot buy it after receiving it.',
            { user: giftTarget?.name ?? '', plan: giftPlanTitle }
          )}
          confirmText={t('Gift')}
          isLoading={gift.isPending}
          handleConfirm={() => giftTarget && gift.mutate(giftTarget)}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
