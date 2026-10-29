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
import { MessageSquareText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import { getMyFeedback, markFeedbackSeen } from '../api'
import {
  FEEDBACK_CATEGORY_CONFIG,
  FEEDBACK_POLL_MS,
  FEEDBACK_STATUS_CONFIG,
  FEEDBACK_UNREAD_KEY,
  MY_FEEDBACK_KEY,
} from '../constants'
import type { Feedback } from '../types'

const PAGE = { p: 1, page_size: 50 }

function FeedbackItem(props: { feedback: Feedback; fresh: boolean }) {
  const { t } = useTranslation()
  const status = FEEDBACK_STATUS_CONFIG[props.feedback.status]
  const category = FEEDBACK_CATEGORY_CONFIG[props.feedback.category]
  return (
    <li className='flex flex-col gap-2 rounded-lg border p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='min-w-0 flex-1 truncate font-medium'>
          {props.feedback.title}
        </span>
        {props.fresh && <Badge>{t('New reply')}</Badge>}
        <StatusBadge
          label={t(status?.label ?? props.feedback.status)}
          variant={status?.variant ?? 'neutral'}
          showDot
          copyable={false}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(category?.label ?? props.feedback.category)} ·{' '}
        <span className='tabular-nums'>
          {formatTimestampToDate(props.feedback.created_time)}
        </span>
      </p>
      <p className='text-sm break-words whitespace-pre-wrap'>
        {props.feedback.description}
      </p>
      {props.feedback.admin_reply && (
        <div className='bg-muted/50 rounded-md p-3 text-sm'>
          <p className='text-muted-foreground mb-1 text-xs'>
            {t('Reply')}
            {props.feedback.replied_time > 0 && (
              <>
                {' · '}
                <span className='tabular-nums'>
                  {formatTimestampToDate(props.feedback.replied_time)}
                </span>
              </>
            )}
          </p>
          <p className='break-words whitespace-pre-wrap'>
            {props.feedback.admin_reply}
          </p>
        </div>
      )}
      {props.feedback.reward_quota > 0 && (
        <p className='text-sm text-emerald-700 dark:text-emerald-400'>
          {t('Reward credited: {{amount}}', {
            amount: formatQuotaWithCurrency(props.feedback.reward_quota),
          })}
        </p>
      )}
    </li>
  )
}

/** The signed-in customer's reports, newest first, with replies. */
export function MyFeedbackList() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [...MY_FEEDBACK_KEY, PAGE],
    queryFn: () => getMyFeedback(PAGE),
    refetchInterval: FEEDBACK_POLL_MS,
  })
  // Replies that were unread when shown keep their mark for this visit,
  // after the server has recorded them as seen.
  const [freshIds, setFreshIds] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    const unread = (query.data?.items ?? []).filter(
      (feedback) => feedback.replied_time > feedback.seen_time
    )
    if (unread.length === 0) return
    setFreshIds((previous) => {
      const next = new Set(previous)
      for (const feedback of unread) next.add(feedback.id)
      return next
    })
    const until = Math.max(...unread.map((feedback) => feedback.replied_time))
    markFeedbackSeen(until)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: FEEDBACK_UNREAD_KEY })
      )
      .catch(() => undefined)
  }, [query.data, queryClient])

  if (query.isPending) return <LoadingState />
  const items = query.data?.items ?? []
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title={t('No feedback yet')}
        description={t('Reports you submit and our replies appear here.')}
      />
    )
  }
  return (
    <ul className='flex flex-col gap-3' aria-label={t('My feedback')}>
      {items.map((feedback) => (
        <FeedbackItem
          key={feedback.id}
          feedback={feedback}
          fresh={freshIds.has(feedback.id)}
        />
      ))}
    </ul>
  )
}
