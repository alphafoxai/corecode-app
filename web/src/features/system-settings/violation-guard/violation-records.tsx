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
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { Input } from '@/components/ui/input'
import { handleServerError } from '@/lib/handle-server-error'

import { getViolations, liftViolations, type ViolationRecord } from './api'
import { useViolationColumns } from './violation-columns'

const EMPTY_RECORDS: ViolationRecord[] = []

export function ViolationRecords() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [userIdInput, setUserIdInput] = useState('')
  const [liftTarget, setLiftTarget] = useState<ViolationRecord | null>(null)
  const parsedUserId = Number.parseInt(userIdInput, 10)
  const userId = parsedUserId > 0 ? parsedUserId : undefined

  const query = useQuery({
    queryKey: ['violations', pagination, userId],
    queryFn: () =>
      getViolations({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        user_id: userId,
      }),
  })

  const lift = useMutation({
    mutationFn: (record: ViolationRecord) => liftViolations(record.user_id),
    onSuccess: () => {
      toast.success(t('Restrictions lifted'))
      setLiftTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['violations'] })
    },
    onError: (error) => handleServerError(error),
  })

  const onLift = useCallback(
    (record: ViolationRecord) => setLiftTarget(record),
    []
  )
  // Suspensions are compared with the time the records were loaded.
  const nowSeconds = Math.floor(query.dataUpdatedAt / 1000)
  const columns = useViolationColumns({ nowSeconds, onLift })
  const { table } = useDataTable({
    columns,
    data: query.data?.items ?? EMPTY_RECORDS,
    getRowId: (record) => String(record.id),
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
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h4 className='text-sm font-medium'>{t('Violation records')}</h4>
        <Input
          type='number'
          min={1}
          className='w-40'
          placeholder={t('Filter by user ID')}
          aria-label={t('Filter by user ID')}
          value={userIdInput}
          onChange={(e) => {
            setUserIdInput(e.target.value)
            setPagination((previous) => ({ ...previous, pageIndex: 0 }))
          }}
        />
      </div>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        emptyTitle={
          query.isError
            ? t('Failed to load violation records')
            : t('No violation records')
        }
        toolbarProps={null}
        hideMobile
        className='h-auto min-h-0'
        applyHeaderSize
      />
      <ConfirmDialog
        open={liftTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLiftTarget(null)
        }}
        title={t('Lift restrictions')}
        desc={t(
          'This ends any suspension of {{user}}, unblocks their refused conversations and stops earlier violations from counting. It does not re-enable an account that was disabled; re-enable it in user management after lifting.',
          { user: liftTarget?.username ?? '' }
        )}
        confirmText={t('Lift')}
        isLoading={lift.isPending}
        handleConfirm={() => {
          if (liftTarget) lift.mutate(liftTarget)
        }}
      />
    </div>
  )
}
