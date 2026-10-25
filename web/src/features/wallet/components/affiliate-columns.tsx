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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { formatPaymentMoney } from '../lib'
import type { AffiliateCommission, AffiliateWithdrawal } from '../types'
import { WithdrawalStatusBadge } from './withdrawal-status-badge'

const timeCell = (value: number) => (
  <span className='font-mono tabular-nums'>{formatTimestampToDate(value)}</span>
)

export function useCommissionColumns(): ColumnDef<AffiliateCommission>[] {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        size: 170,
        cell: ({ row }) => timeCell(row.original.created_at),
        meta: { label: t('Time'), mobileTitle: true },
      },
      {
        accessorKey: 'source_name',
        header: t('Source'),
        size: 120,
        cell: ({ row }) => row.original.source_name || '-',
        meta: { label: t('Source') },
      },
      {
        accessorKey: 'level',
        header: t('Level'),
        size: 110,
        cell: ({ row }) => (
          <StatusBadge
            label={
              row.original.level === 2 ? t('Second level') : t('Direct invitee')
            }
            variant={row.original.level === 2 ? 'purple' : 'info'}
            copyable={false}
          />
        ),
        meta: { label: t('Level') },
      },
      {
        accessorKey: 'rate',
        header: t('Rate'),
        size: 70,
        cell: ({ row }) => `${row.original.rate}%`,
        meta: { label: t('Rate') },
      },
      {
        accessorKey: 'amount',
        header: t('Commission'),
        size: 110,
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            {formatQuota(row.original.amount)}
          </span>
        ),
        meta: { label: t('Commission') },
      },
    ],
    [t]
  )
}

export function useWithdrawalColumns(): ColumnDef<AffiliateWithdrawal>[] {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        size: 170,
        cell: ({ row }) => timeCell(row.original.created_at),
        meta: { label: t('Time'), mobileTitle: true },
      },
      {
        accessorKey: 'money',
        header: t('Amount'),
        size: 120,
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
        size: 160,
        cell: ({ row }) => row.original.account,
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
    ],
    [t]
  )
}
