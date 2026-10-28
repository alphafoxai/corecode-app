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
import { Loader2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AFFILIATE_SELF_KEY } from '@/features/wallet/hooks/use-affiliate'
import { AFF_CODE_PATTERN } from '@/features/wallet/lib'
import { handleServerError } from '@/lib/handle-server-error'

import { updateSelfAffCode } from '../api'

type InviteCodeDialogProps = {
  code: string
}

/** Lets a user replace the code in their invitation link with one they choose. */
export function InviteCodeDialog(props: InviteCodeDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(props.code)

  const save = useMutation({
    mutationFn: updateSelfAffCode,
    onSuccess: (summary) => {
      queryClient.setQueryData(AFFILIATE_SELF_KEY, summary)
      toast.success(t('Invite code updated'))
      setOpen(false)
    },
    onError: (error) => handleServerError(error),
  })

  const trimmed = code.trim()
  const valid = AFF_CODE_PATTERN.test(trimmed)
  const canSave = valid && trimmed !== props.code && !save.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setCode(props.code)
      }}
      trigger={
        <Button variant='outline' size='lg' className='bg-background shrink-0'>
          <Pencil className='size-4' />
          {t('Customize')}
        </Button>
      }
      title={t('Customize invite code')}
      description={t(
        'Brand names and simple codes such as 888 or 123 are reserved.'
      )}
      contentClassName='sm:max-w-md'
      footer={
        <>
          <Button variant='outline' onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form='invite-code-form' disabled={!canSave}>
            {save.isPending && <Loader2 className='animate-spin' />}
            {t('Save invite code')}
          </Button>
        </>
      }
    >
      <form
        id='invite-code-form'
        className='space-y-2'
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) save.mutate(trimmed)
        }}
      >
        <Label htmlFor='invite-code'>{t('Invite code')}</Label>
        <Input
          id='invite-code'
          value={code}
          maxLength={32}
          aria-invalid={trimmed !== '' && !valid}
          className='font-mono'
          onChange={(e) => setCode(e.target.value)}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            '3 to 32 letters, digits, hyphens or underscores. Links with the old code stop working.'
          )}
        </p>
      </form>
    </Dialog>
  )
}
