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

import { TruncatedCell } from '@/components/data-table'
import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import { formatTimestampToDate } from '@/lib/format'

import type { RiskGateAction, RiskGateEvent, RiskGateStage } from './api'

const ACTION_VARIANTS: Record<RiskGateAction, StatusVariant> = {
  blocked: 'danger',
  observed: 'info',
  fail_open: 'warning',
}

export function useRiskGateStageLabels(): Record<RiskGateStage, string> {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      distill: t('Distillation'),
      hard_regex: t('Hard regex'),
      refusal_cache: t('Refusal cache'),
      decision: t('Decision model'),
    }),
    [t]
  )
}

export function useRiskGateColumns(): ColumnDef<RiskGateEvent>[] {
  const { t } = useTranslation()
  const stageLabels = useRiskGateStageLabels()

  return useMemo(() => {
    const actionLabels: Record<RiskGateAction, string> = {
      blocked: t('Blocked'),
      observed: t('Observe (not enforced)'),
      fail_open: t('Model failed, let through'),
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
        id: 'stage',
        header: t('Stage'),
        size: 200,
        cell: ({ row }) => (
          <span className='flex flex-wrap items-center gap-1'>
            <StatusBadge
              label={stageLabels[row.original.stage]}
              variant='neutral'
              copyable={false}
            />
            <span className='font-mono text-xs'>{row.original.rule}</span>
          </span>
        ),
        meta: { label: t('Stage') },
      },
      {
        id: 'action',
        header: t('Action'),
        size: 150,
        cell: ({ row }) => (
          <StatusBadge
            label={actionLabels[row.original.action]}
            variant={ACTION_VARIANTS[row.original.action]}
            copyable={false}
          />
        ),
        meta: { label: t('Action') },
      },
      {
        accessorKey: 'detail',
        header: t('Detail'),
        size: 140,
        cell: ({ row }) =>
          row.original.detail ? (
            <TruncatedCell>{row.original.detail}</TruncatedCell>
          ) : (
            '-'
          ),
        meta: { label: t('Detail') },
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
        accessorKey: 'model_name',
        header: t('Model'),
        size: 160,
        cell: ({ row }) => (
          <TruncatedCell>{row.original.model_name}</TruncatedCell>
        ),
        meta: { label: t('Model') },
      },
      {
        accessorKey: 'excerpt',
        header: t('Message'),
        size: 260,
        cell: ({ row }) =>
          row.original.excerpt ? (
            <TruncatedCell tooltipClassName='max-w-md whitespace-pre-wrap break-words'>
              {row.original.excerpt}
            </TruncatedCell>
          ) : (
            '-'
          ),
        meta: { label: t('Message') },
      },
      {
        accessorKey: 'request_id',
        header: t('Request ID'),
        size: 200,
        cell: ({ row }) => (
          <TruncatedCell>
            <span className='font-mono'>{row.original.request_id}</span>
          </TruncatedCell>
        ),
        meta: { label: t('Request ID') },
      },
    ]
  }, [t, stageLabels])
}
