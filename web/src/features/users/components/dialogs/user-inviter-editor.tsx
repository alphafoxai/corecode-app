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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AffiliateAdminView } from '@/features/wallet/types'
import { useDebounce } from '@/hooks/use-debounce'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import { searchUsers, updateUserInviter } from '../../api'
import type { User } from '../../types'

type UserInviterEditorProps = {
  userId: number
  view: AffiliateAdminView
  onSaved: (view: AffiliateAdminView) => void
}

/**
 * Lets an administrator bind a user to the inviter they should have had, found
 * by username or email, or remove the binding. Commission follows the new
 * inviter only from the change on.
 */
export function UserInviterEditor(props: UserInviterEditorProps) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<User | null>(null)
  const search = useDebounce(keyword.trim(), 300)

  const candidates = useQuery({
    queryKey: ['affiliate', 'inviter-search', search],
    queryFn: async () => {
      const res = await searchUsers({ keyword: search, page_size: 6 })
      return (res.data?.items ?? []).filter(
        (user) => user.id !== props.userId && !user.DeletedAt
      )
    },
    enabled: search.length >= 2,
  })
  const searching = candidates.isFetching && !candidates.data

  const save = useMutation({
    mutationFn: (inviterId: number) =>
      updateUserInviter(props.userId, inviterId),
    onSuccess: (next) => {
      props.onSaved(next)
      setKeyword('')
      setSelected(null)
      toast.success(t('Inviter updated'))
    },
    onError: (error) => handleServerError(error),
  })

  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <Label htmlFor='affiliate-inviter-search'>{t('Change inviter')}</Label>
      <Input
        id='affiliate-inviter-search'
        placeholder={t('Search the inviter by username or email')}
        value={keyword}
        onChange={(e) => {
          setKeyword(e.target.value)
          setSelected(null)
        }}
      />
      {search.length >= 2 && !selected && (
        <div className='max-h-48 overflow-y-auto rounded-md border'>
          {searching && (
            <p className='text-muted-foreground p-2 text-xs'>
              {t('Searching...')}
            </p>
          )}
          {!searching &&
            candidates.data?.map((user) => (
              <button
                key={user.id}
                type='button'
                className={cn(
                  'hover:bg-muted flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm',
                  user.id === props.view.inviter_id && 'opacity-50'
                )}
                disabled={user.id === props.view.inviter_id}
                onClick={() => setSelected(user)}
              >
                <span className='min-w-0 truncate'>
                  {user.username}
                  {user.email && (
                    <span className='text-muted-foreground ms-2'>
                      {user.email}
                    </span>
                  )}
                </span>
                <span className='text-muted-foreground shrink-0 font-mono text-xs'>
                  #{user.id}
                </span>
              </button>
            ))}
          {!searching && candidates.data?.length === 0 && (
            <p className='text-muted-foreground p-2 text-xs'>
              {t('No matching users')}
            </p>
          )}
        </div>
      )}
      {selected && (
        <p className='text-sm'>
          {t('New inviter: {{user}}', {
            user: `${selected.username}${selected.email ? ` (${selected.email})` : ''} #${selected.id}`,
          })}
        </p>
      )}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Commission on this user follows the new inviter from now on; commission already earned stays where it is.'
        )}
      </p>
      <div className='flex justify-end gap-2'>
        {props.view.inviter_id > 0 && (
          <Button
            variant='outline'
            disabled={save.isPending}
            onClick={() => save.mutate(0)}
          >
            {t('Remove inviter')}
          </Button>
        )}
        <Button
          disabled={!selected || save.isPending}
          onClick={() => selected && save.mutate(selected.id)}
        >
          {save.isPending && <Loader2 className='animate-spin' />}
          {t('Set inviter')}
        </Button>
      </div>
    </div>
  )
}
