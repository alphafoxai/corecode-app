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
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AFF_CODE_PATTERN, generateAffiliateLink } from '@/features/wallet/lib'
import type { AffiliateAdminView } from '@/features/wallet/types'
import { handleServerError } from '@/lib/handle-server-error'

import { updateUserAffCode } from '../../api'

type UserAffCodeEditorProps = {
  userId: number
  view: AffiliateAdminView
  onSaved: (view: AffiliateAdminView) => void
}

/**
 * Shows a user's invitation link and lets a root user replace the code in it
 * with one that is easy to promote, such as a channel's name.
 */
export function UserAffCodeEditor(props: UserAffCodeEditorProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState(props.view.aff_code)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(props.view.aff_code)
  }, [props.view.aff_code])

  const save = useMutation({
    mutationFn: (next: string) => updateUserAffCode(props.userId, next),
    onSuccess: (next) => {
      props.onSaved(next)
      toast.success(t('Invite code updated'))
    },
    onError: (error) => handleServerError(error),
  })

  const trimmed = code.trim()
  const valid = AFF_CODE_PATTERN.test(trimmed)
  const link = props.view.aff_code
    ? generateAffiliateLink(props.view.aff_code)
    : ''

  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <Label htmlFor='affiliate-code'>{t('Invite code')}</Label>
      <div className='flex items-center gap-2'>
        <Input
          id='affiliate-code'
          value={code}
          maxLength={32}
          aria-invalid={trimmed !== '' && !valid}
          className='font-mono'
          onChange={(e) => setCode(e.target.value)}
        />
        <Button
          disabled={!valid || trimmed === props.view.aff_code || save.isPending}
          onClick={() => save.mutate(trimmed)}
        >
          {save.isPending && <Loader2 className='animate-spin' />}
          {t('Save invite code')}
        </Button>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          '3 to 32 letters, digits, hyphens or underscores. Links with the old code stop working.'
        )}
      </p>
      {link && (
        <div className='flex items-center gap-2'>
          <Input
            value={link}
            readOnly
            aria-label={t('Referral link')}
            className='h-9 min-w-0 flex-1 font-mono text-xs'
          />
          <CopyButton
            value={link}
            variant='outline'
            className='size-9 shrink-0'
            iconClassName='size-4'
            tooltip={t('Copy referral link')}
            aria-label={t('Copy referral link')}
          />
        </div>
      )}
      {props.view.enabled && props.view.affiliate?.rate === 0 && (
        <p className='text-destructive text-xs'>
          {t('This user has no commission rate, so the link binds no one.')}
        </p>
      )}
    </div>
  )
}
