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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WithdrawalStatusBadge } from '@/features/wallet/components/withdrawal-status-badge'
import { formatPaymentMoney } from '@/features/wallet/lib'
import { formatQuota, formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  getAdminWithdrawals,
  processWithdrawal,
  type AdminWithdrawal,
  type WithdrawalFilter,
} from './api'

type Action = 'pay' | 'reject'
type Target = { action: Action; withdrawal: AdminWithdrawal }

const EMPTY: AdminWithdrawal[] = []

export function AffiliateWithdrawals() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<WithdrawalFilter>('pending')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [target, setTarget] = useState<Target | null>(null)
  const [note, setNote] = useState('')

  const query = useQuery({
    queryKey: ['affiliate', 'admin-withdrawals', status, pagination],
    queryFn: () =>
      getAdminWithdrawals({
        status,
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }),
  })

  const process = useMutation({
    mutationFn: (current: Target) =>
      processWithdrawal(current.withdrawal.id, current.action, note.trim()),
    onSuccess: (_data, current) => {
      toast.success(
        current.action === 'pay'
          ? t('Withdrawal marked as paid')
          : t('Withdrawal rejected')
      )
      setTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['affiliate'] })
    },
    onError: (error) => handleServerError(error),
  })

  const columns = useMemo<ColumnDef<AdminWithdrawal>[]>(() => {
    const open = (action: Action, withdrawal: AdminWithdrawal) => {
      setNote('')
      setTarget({ action, withdrawal })
    }
    return [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        size: 170,
        cell: ({ row }) => (
          <span className='font-mono tabular-nums'>
            {formatTimestampToDate(row.original.created_at)}
          </span>
        ),
        meta: { label: t('Time'), mobileTitle: true },
      },
      {
        id: 'user',
        header: t('User'),
        size: 150,
        cell: ({ row }) => (
          <span>
            {row.original.username}{' '}
            <span className='text-muted-foreground'>
              #{row.original.user_id}
            </span>
          </span>
        ),
        meta: { label: t('User') },
      },
      {
        accessorKey: 'money',
        header: t('Amount'),
        size: 150,
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatPaymentMoney(row.original.money)}{' '}
            <span className='text-muted-foreground'>
              ({formatQuota(row.original.quota)})
            </span>
          </span>
        ),
        meta: { label: t('Amount') },
      },
      {
        accessorKey: 'account',
        header: t('Payout account'),
        size: 200,
        meta: { label: t('Payout account') },
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        size: 100,
        cell: ({ row }) => (
          <WithdrawalStatusBadge status={row.original.status} />
        ),
        meta: { label: t('Status') },
      },
      {
        accessorKey: 'note',
        header: t('Note'),
        size: 160,
        cell: ({ row }) => row.original.note || '-',
        meta: { label: t('Note') },
      },
      {
        id: 'actions',
        header: '',
        size: 160,
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <span className='flex gap-2'>
              <Button size='sm' onClick={() => open('pay', row.original)}>
                {t('Pay')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => open('reject', row.original)}
              >
                {t('Reject')}
              </Button>
            </span>
          ) : null,
        meta: { label: t('Actions') },
      },
    ]
  }, [t])

  const { table } = useDataTable({
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

  const filterItems = [
    { value: 'pending', label: t('Pending') },
    { value: 'paid', label: t('Paid') },
    { value: 'rejected', label: t('Rejected') },
    { value: '', label: t('All') },
  ]
  const paying = target?.action === 'pay'

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h4 className='text-sm font-medium'>{t('Withdrawal requests')}</h4>
        <Select
          items={filterItems}
          value={status}
          onValueChange={(value) => {
            setStatus((value ?? '') as WithdrawalFilter)
            setPagination((previous) => ({ ...previous, pageIndex: 0 }))
          }}
        >
          <SelectTrigger className='w-40' aria-label={t('Status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {filterItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        emptyTitle={
          query.isError
            ? t('Failed to load withdrawals')
            : t('No withdrawal requests')
        }
        toolbarProps={null}
        hideMobile
        className='h-auto min-h-0'
        applyHeaderSize
      />
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        title={paying ? t('Mark as paid') : t('Reject withdrawal')}
        desc={
          paying
            ? t(
                'Confirm you have paid {{money}} to {{account}}. This cannot be undone.',
                {
                  money: formatPaymentMoney(target?.withdrawal.money ?? 0),
                  account: target?.withdrawal.account ?? '',
                }
              )
            : t(
                'Reject this withdrawal? The commission of {{user}} is returned to their balance.',
                { user: target?.withdrawal.username ?? '' }
              )
        }
        confirmText={paying ? t('Mark as paid') : t('Reject')}
        destructive={!paying}
        isLoading={process.isPending}
        handleConfirm={() => {
          if (target) process.mutate(target)
        }}
      >
        <Input
          value={note}
          maxLength={200}
          placeholder={t('Note (optional)')}
          aria-label={t('Note (optional)')}
          onChange={(e) => setNote(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  )
}
