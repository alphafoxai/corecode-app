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
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ENTERPRISE_SPEND_BANDS } from '@/features/enterprise/constants'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from '@/features/usage-logs/components/logs-filter-toolbar'
import { formatTimestampToDate } from '@/lib/format'

import { getEnterpriseApplications } from './api'
import { ApplicationDialog } from './components/application-dialog'
import {
  APPLICATION_STATUS_CONFIG,
  APPLICATION_STATUSES,
  APPLICATIONS_KEY,
} from './constants'
import type {
  EnterpriseApplication,
  EnterpriseApplicationFilters,
} from './types'

const route = getRouteApi('/_authenticated/enterprise-applications/')
const EMPTY: EnterpriseApplication[] = []
const ALL = '__all__'

function useApplicationColumns(
  onOpen: (application: EnterpriseApplication) => void
): ColumnDef<EnterpriseApplication>[] {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        accessorKey: 'created_time',
        header: t('Submitted'),
        size: 170,
        cell: ({ row }) => (
          <span className='font-mono tabular-nums'>
            {formatTimestampToDate(row.original.created_time)}
          </span>
        ),
        meta: { label: t('Submitted') },
      },
      {
        accessorKey: 'company',
        header: t('Company name'),
        size: 180,
        cell: ({ row }) => (
          <span className='truncate font-medium'>{row.original.company}</span>
        ),
        meta: { label: t('Company name'), mobileTitle: true },
      },
      {
        accessorKey: 'contact_name',
        header: t('Contact'),
        size: 220,
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col'>
            <span className='truncate'>{row.original.contact_name}</span>
            <span className='text-muted-foreground truncate text-xs'>
              {row.original.email}
            </span>
          </div>
        ),
        meta: { label: t('Contact') },
      },
      {
        accessorKey: 'monthly_spend',
        header: t('Monthly spend'),
        size: 150,
        cell: ({ row }) => {
          const band = ENTERPRISE_SPEND_BANDS.find(
            (item) => item.value === row.original.monthly_spend
          )
          return band ? t(band.labelKey) : row.original.monthly_spend
        },
        meta: { label: t('Monthly spend') },
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        size: 110,
        cell: ({ row }) => {
          const config = APPLICATION_STATUS_CONFIG[row.original.status]
          return (
            <StatusBadge
              label={t(config?.label ?? row.original.status)}
              variant={config?.variant ?? 'neutral'}
              showDot
              copyable={false}
            />
          )
        },
        meta: { label: t('Status') },
      },
      {
        id: 'actions',
        header: '',
        size: 90,
        cell: ({ row }) => (
          <Button
            size='sm'
            variant='outline'
            onClick={() => onOpen(row.original)}
          >
            {t('Review')}
          </Button>
        ),
      },
    ],
    [t, onOpen]
  )
}

export function EnterpriseApplications() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const filters: EnterpriseApplicationFilters = {
    status: search.status,
    keyword: search.keyword,
  }
  const [draft, setDraft] = useState(filters)
  const pagination = {
    pageIndex: (search.page ?? 1) - 1,
    pageSize: search.pageSize ?? 20,
  }

  const applications = useQuery({
    queryKey: [...APPLICATIONS_KEY, filters, pagination],
    queryFn: () =>
      getEnterpriseApplications(filters, {
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }),
    placeholderData: (previous) => previous,
  })

  const [open, setOpen] = useState<EnterpriseApplication | null>(null)
  const columns = useApplicationColumns(setOpen)
  const { table } = useDataTable<EnterpriseApplication>({
    columns,
    data: applications.data?.items ?? EMPTY,
    getRowId: (row) => String(row.id),
    totalCount: applications.data?.total ?? 0,
    pagination,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater
      void navigate({
        search: (previous) => ({
          ...previous,
          page: next.pageSize === pagination.pageSize ? next.pageIndex + 1 : 1,
          pageSize: next.pageSize,
        }),
      })
    },
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })

  const applyFilters = (next: EnterpriseApplicationFilters) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        page: 1,
        status: next.status || undefined,
        keyword: next.keyword?.trim() || undefined,
      }),
    })
  }

  const statusItems = [
    { value: ALL, label: t('All statuses') },
    ...APPLICATION_STATUSES.map((value) => ({
      value,
      label: t(APPLICATION_STATUS_CONFIG[value].label),
    })),
  ]

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Enterprise Applications')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={applications.isPending}
            isFetching={applications.isFetching}
            emptyTitle={t('No applications')}
            emptyDescription={t(
              'Applications from the enterprise page appear here.'
            )}
            toolbar={
              <LogsFilterToolbar
                table={table}
                hasActiveFilters={Boolean(draft.status || draft.keyword)}
                searchLoading={applications.isFetching}
                onSearch={() => applyFilters(draft)}
                onReset={() => {
                  setDraft({})
                  applyFilters({})
                }}
                primaryFilters={
                  <>
                    <LogsFilterField>
                      <LogsFilterInput
                        value={draft.keyword ?? ''}
                        onChange={(event) =>
                          setDraft({ ...draft, keyword: event.target.value })
                        }
                        onKeyDown={(event) =>
                          event.key === 'Enter' && applyFilters(draft)
                        }
                        placeholder={t('Company, contact or email')}
                        aria-label={t('Company, contact or email')}
                      />
                    </LogsFilterField>
                    <LogsFilterField>
                      <Select
                        items={statusItems}
                        value={draft.status || ALL}
                        onValueChange={(value) =>
                          setDraft({
                            ...draft,
                            status:
                              value === ALL || value === null ? '' : value,
                          })
                        }
                      >
                        <SelectTrigger className='h-8' aria-label={t('Status')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {statusItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </LogsFilterField>
                  </>
                }
              />
            }
            className='h-auto min-h-0'
            applyHeaderSize
          />
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {open && (
        <ApplicationDialog
          key={open.id}
          application={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
