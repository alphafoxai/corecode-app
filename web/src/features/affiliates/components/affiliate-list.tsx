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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
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
import { UserAffiliateDialog } from '@/features/users/components/dialogs/user-affiliate-dialog'
import { generateAffiliateLink } from '@/features/wallet/lib'
import { useDebounce } from '@/hooks/use-debounce'
import { formatQuota } from '@/lib/format'

import {
  getAffiliates,
  type AffiliateListItem,
  type AffiliateListSort,
  type AffiliateListType,
} from '../api'

const EMPTY: AffiliateListItem[] = []

/**
 * Every user who can invite or has invited someone, with their code, terms
 * and results. A row opens the same settings dialog as the user list.
 */
export function AffiliateList() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState<AffiliateListType>('')
  const [sort, setSort] = useState<AffiliateListSort>('invitees')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [selected, setSelected] = useState<AffiliateListItem | null>(null)
  const search = useDebounce(keyword.trim(), 300)

  const query = useQuery({
    queryKey: ['affiliate', 'admin-list', search, type, sort, pagination],
    queryFn: () =>
      getAffiliates({
        keyword: search,
        type,
        sort,
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }),
  })

  const columns = useMemo<ColumnDef<AffiliateListItem>[]>(
    () => [
      {
        id: 'user',
        header: t('User'),
        size: 220,
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='truncate font-medium'>
              {row.original.username}{' '}
              <span className='text-muted-foreground font-normal'>
                #{row.original.user_id}
              </span>
            </div>
            {row.original.email && (
              <div className='text-muted-foreground truncate text-xs'>
                {row.original.email}
              </div>
            )}
          </div>
        ),
        meta: { label: t('User'), mobileTitle: true },
      },
      {
        id: 'code',
        header: t('Invite code'),
        size: 170,
        cell: ({ row }) =>
          row.original.aff_code ? (
            <span className='flex items-center gap-1'>
              <span className='truncate font-mono'>
                {row.original.aff_code}
              </span>
              <CopyButton
                value={generateAffiliateLink(row.original.aff_code)}
                variant='ghost'
                className='size-7 shrink-0'
                iconClassName='size-3.5'
                tooltip={t('Copy referral link')}
                aria-label={t('Copy referral link')}
              />
            </span>
          ) : (
            '-'
          ),
        meta: { label: t('Invite code') },
      },
      {
        id: 'rate',
        header: t('Commission rate'),
        size: 150,
        cell: ({ row }) => {
          if (!row.original.has_affiliate) {
            return <span className='text-muted-foreground'>{t('Not set')}</span>
          }
          return (
            <span className='flex items-center gap-1.5'>
              <span className='tabular-nums'>{row.original.rate}%</span>
              {row.original.tier === 'retail' && (
                <Badge variant='secondary'>{t('Retail channel')}</Badge>
              )}
              {row.original.tier === 'distributor' && (
                <Badge variant='secondary'>{t('Distributor channel')}</Badge>
              )}
              {row.original.rate === 0 && (
                <Badge variant='outline'>{t('Revoked')}</Badge>
              )}
            </span>
          )
        },
        meta: { label: t('Commission rate') },
      },
      {
        accessorKey: 'invitee_count',
        header: t('Invites'),
        size: 90,
        cell: ({ row }) => (
          <span className='tabular-nums'>{row.original.invitee_count}</span>
        ),
        meta: { label: t('Invites') },
      },
      {
        accessorKey: 'earned',
        header: t('Total Earned'),
        size: 130,
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatQuota(row.original.earned)}
          </span>
        ),
        meta: { label: t('Total Earned') },
      },
      {
        accessorKey: 'balance',
        header: t('Commission balance'),
        size: 130,
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatQuota(row.original.balance)}
          </span>
        ),
        meta: { label: t('Commission balance') },
      },
      {
        id: 'actions',
        header: '',
        size: 100,
        cell: ({ row }) => (
          <Button
            size='sm'
            variant='outline'
            onClick={() => setSelected(row.original)}
          >
            {t('Manage')}
          </Button>
        ),
        meta: { label: t('Actions') },
      },
    ],
    [t]
  )

  const { table } = useDataTable({
    columns,
    data: query.data?.items ?? EMPTY,
    getRowId: (row) => String(row.user_id),
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

  const typeItems = [
    { value: '', label: t('All') },
    { value: 'inviting', label: t('With invitees') },
    { value: 'channel', label: t('Promotion channels') },
    { value: 'retail', label: t('Retail channels') },
    { value: 'distributor', label: t('Distributor channels') },
    { value: 'revoked', label: t('Revoked') },
  ]
  const sortItems = [
    { value: 'invitees', label: t('Most invites') },
    { value: 'earned', label: t('Most earned') },
    { value: 'recent', label: t('Newest users') },
  ]
  const firstPage = () =>
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          value={keyword}
          placeholder={t('Search by ID, username, email or invite code')}
          aria-label={t('Search')}
          className='w-full sm:w-72'
          onChange={(e) => {
            setKeyword(e.target.value)
            firstPage()
          }}
        />
        <Select
          items={typeItems}
          value={type}
          onValueChange={(value) => {
            setType((value ?? '') as AffiliateListType)
            firstPage()
          }}
        >
          <SelectTrigger className='w-40' aria-label={t('Type')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {typeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={sortItems}
          value={sort}
          onValueChange={(value) => {
            setSort((value ?? 'invitees') as AffiliateListSort)
            firstPage()
          }}
        >
          <SelectTrigger className='w-36' aria-label={t('Sort')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {sortItems.map((item) => (
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
          query.isError ? t('Failed to load affiliates') : t('No affiliates')
        }
        toolbarProps={null}
        hideMobile
        className='h-auto min-h-0'
        applyHeaderSize
      />
      {selected && (
        <UserAffiliateDialog
          open
          onOpenChange={(open) => {
            if (open) return
            setSelected(null)
            // The dialog may have changed the rate, channel or code.
            void queryClient.invalidateQueries({
              queryKey: ['affiliate', 'admin-list'],
            })
          }}
          user={{ id: selected.user_id, username: selected.username }}
        />
      )}
    </div>
  )
}
