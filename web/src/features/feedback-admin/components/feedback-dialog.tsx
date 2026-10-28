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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { updateFeedback } from '@/features/feedback/api'
import {
  ALL_FEEDBACK_KEY,
  FEEDBACK_CATEGORY_CONFIG,
  FEEDBACK_STATUS_CONFIG,
  FEEDBACK_STATUSES,
} from '@/features/feedback/constants'
import type { Feedback, FeedbackStatus } from '@/features/feedback/types'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

type FeedbackContext = {
  user_agent?: string
  recent_logs?: {
    id: number
    created_at: number
    type: number
    model_name: string
    request_id?: string
  }[]
}

/** The attached context, or an empty one when it is missing or unreadable. */
function readContext(raw: string): FeedbackContext {
  try {
    return (JSON.parse(raw) as FeedbackContext | null) ?? {}
  } catch {
    return {}
  }
}

type FeedbackDialogProps = {
  feedback: Feedback
  onClose: () => void
}

/** Shows one report and records the administrator's reply and reward. */
export function FeedbackDialog(props: FeedbackDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<FeedbackStatus>(props.feedback.status)
  const [reply, setReply] = useState(props.feedback.admin_reply)
  const [reward, setReward] = useState('')
  const rewarded = props.feedback.reward_quota > 0
  const rewardUSD = Number(reward || 0)
  const rewardValid =
    Number.isFinite(rewardUSD) && rewardUSD >= 0 && rewardUSD <= 1000

  const save = useMutation({
    mutationFn: () =>
      updateFeedback(props.feedback.id, {
        status,
        admin_reply: reply,
        reward_usd: rewarded ? 0 : rewardUSD,
      }),
    onSuccess: async () => {
      toast.success(t('Feedback updated'))
      await queryClient.invalidateQueries({ queryKey: ALL_FEEDBACK_KEY })
      props.onClose()
    },
    onError: (error) =>
      handleServerError(error, t('Failed to update feedback')),
  })

  const context = readContext(props.feedback.context)
  const category = FEEDBACK_CATEGORY_CONFIG[props.feedback.category]
  const details = [
    { label: t('Account'), value: `#${props.feedback.user_id}` },
    {
      label: t('Type'),
      value: t(category?.label ?? props.feedback.category),
    },
    {
      label: t('Submitted'),
      value: formatTimestampToDate(props.feedback.created_time),
    },
    { label: t('Description'), value: props.feedback.description },
    { label: t('Related request'), value: props.feedback.related_request },
    { label: t('QQ, WeChat or email'), value: props.feedback.contact },
    { label: t('Browser'), value: context.user_agent ?? '' },
    {
      label: t('Recent requests'),
      value: (context.recent_logs ?? [])
        .map((log) =>
          [
            formatTimestampToDate(log.created_at),
            log.model_name || '-',
            `type ${log.type}`,
            log.request_id,
          ]
            .filter(Boolean)
            .join('  ')
        )
        .join('\n'),
    },
  ]

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={props.feedback.title}
      footer={
        <>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !rewardValid}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-5'>
        <dl className='grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]'>
          {details.map((item) => (
            <div key={item.label} className='contents'>
              <dt className='text-muted-foreground'>{item.label}</dt>
              <dd className='break-words whitespace-pre-wrap'>
                {item.value || '-'}
              </dd>
            </div>
          ))}
        </dl>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='feedback-status'>{t('Status')}</Label>
          <NativeSelect
            id='feedback-status'
            className='w-full'
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as FeedbackStatus)
            }
          >
            {FEEDBACK_STATUSES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {t(FEEDBACK_STATUS_CONFIG[value].label)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='feedback-reply'>{t('Reply to the customer')}</Label>
          <Textarea
            id='feedback-reply'
            rows={3}
            maxLength={2000}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='feedback-reward'>{t('Reward (USD)')}</Label>
          {rewarded ? (
            <p className='text-sm'>
              {t('Already rewarded: {{amount}}', {
                amount: formatQuotaWithCurrency(props.feedback.reward_quota),
              })}
            </p>
          ) : (
            <>
              <Input
                id='feedback-reward'
                type='number'
                inputMode='decimal'
                min={0}
                max={1000}
                step='0.01'
                value={reward}
                aria-invalid={!rewardValid}
                onChange={(event) => setReward(event.target.value)}
                placeholder='0'
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Added to the balance once and cannot be undone here. Guide: confirmed bug $5-20, serious billing or security issue $50+, adopted suggestion $5.'
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
