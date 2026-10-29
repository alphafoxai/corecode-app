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
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getFeedbackUnreadCount } from '../api'
import { FEEDBACK_POLL_MS, FEEDBACK_UNREAD_KEY } from '../constants'

/** How many of the customer's reports carry a reply they have not seen. */
export function useFeedbackUnreadCount(): number {
  const query = useQuery({
    queryKey: FEEDBACK_UNREAD_KEY,
    queryFn: getFeedbackUnreadCount,
    refetchInterval: FEEDBACK_POLL_MS,
    retry: false,
  })
  return query.data ?? 0
}

/**
 * Tells the customer when a reply arrives, outside the feedback page: once
 * when the console opens with unread replies, and again whenever the count
 * grows.
 */
export function useFeedbackReplyToast(): void {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const unread = useFeedbackUnreadCount()
  const announced = useRef(0)

  useEffect(() => {
    const previous = announced.current
    announced.current = unread
    if (unread <= previous || pathname === '/feedback') return
    toast.info(t('Your feedback has a new reply'), {
      id: 'feedback-reply',
      action: {
        label: t('View'),
        onClick: () => navigate({ to: '/feedback' }),
      },
    })
  }, [unread, pathname, navigate, t])
}
