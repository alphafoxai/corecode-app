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
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ENTERPRISE_SPEND_BANDS } from '@/features/enterprise/constants'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { updateEnterpriseApplication } from '../api'
import {
  APPLICATION_STATUS_CONFIG,
  APPLICATION_STATUSES,
  APPLICATIONS_KEY,
} from '../constants'
import type {
  EnterpriseApplication,
  EnterpriseApplicationStatus,
} from '../types'

type ApplicationDialogProps = {
  application: EnterpriseApplication
  onClose: () => void
}

/** Shows one application and records the administrator's progress on it. */
export function ApplicationDialog(props: ApplicationDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<EnterpriseApplicationStatus>(
    props.application.status
  )
  const [note, setNote] = useState(props.application.admin_note)

  const save = useMutation({
    mutationFn: () =>
      updateEnterpriseApplication(props.application.id, {
        status,
        admin_note: note,
      }),
    onSuccess: async () => {
      toast.success(t('Application updated'))
      await queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY })
      props.onClose()
    },
    onError: (error) =>
      handleServerError(error, t('Failed to update application')),
  })

  const spend = ENTERPRISE_SPEND_BANDS.find(
    (band) => band.value === props.application.monthly_spend
  )
  const details = [
    { label: t('Company name'), value: props.application.company },
    { label: t('Contact name'), value: props.application.contact_name },
    { label: t('Work email'), value: props.application.email },
    {
      label: t('Telegram, WeChat or phone'),
      value: props.application.other_contact,
    },
    {
      label: t('Estimated monthly spend'),
      value: spend ? t(spend.labelKey) : props.application.monthly_spend,
    },
    { label: t('Models and use case'), value: props.application.use_case },
    { label: t('Anything else'), value: props.application.message },
    {
      label: t('Submitted'),
      value: formatTimestampToDate(props.application.created_time),
    },
    {
      label: t('Account'),
      value:
        props.application.user_id > 0
          ? `#${props.application.user_id}`
          : t('Not signed in'),
    },
    { label: t('IP address'), value: props.application.ip },
  ]

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && props.onClose()}
      title={props.application.company}
      footer={
        <>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-5'>
        <dl className='grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]'>
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
          <Label htmlFor='application-status'>{t('Status')}</Label>
          <NativeSelect
            id='application-status'
            className='w-full'
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as EnterpriseApplicationStatus)
            }
          >
            {APPLICATION_STATUSES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {t(APPLICATION_STATUS_CONFIG[value].label)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='application-note'>{t('Internal note')}</Label>
          <Textarea
            id='application-note'
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('Quoted price, follow-up date, who is handling it')}
          />
        </div>
      </div>
    </Dialog>
  )
}
