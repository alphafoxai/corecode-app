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
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { resolveUserId, saveUserConcurrencyLimits } from '../api'
import type { CapacityInsights } from '../types'
import { Panel, SimpleTable, UserLabel } from './shared'

/**
 * Per-user concurrency overrides. Each one replaces the user's group limit;
 * 0 lifts the limit. Saving writes the whole map back.
 */
export function ConcurrencyLimitsPanel(props: {
  data: CapacityInsights | undefined
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [user, setUser] = useState('')
  const [limit, setLimit] = useState('')
  const overrides = props.data?.user_limits ?? []
  const groups = Object.entries(props.data?.concurrency_limits ?? {})

  const save = useMutation({
    mutationFn: saveUserConcurrencyLimits,
    onSuccess: () => {
      toast.success(t('Concurrency limits saved'))
      queryClient.invalidateQueries({ queryKey: ['site-insights', 'capacity'] })
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  })

  const current = () =>
    Object.fromEntries(overrides.map((row) => [String(row.user_id), row.limit]))

  const add = async () => {
    const value = Number(limit)
    if (!Number.isInteger(value) || value < 0) {
      toast.error(t('Enter a whole number, 0 for unlimited'))
      return
    }
    const id = await resolveUserId(user)
    if (id == null) {
      toast.error(t('No user with that id or username'))
      return
    }
    await save.mutateAsync({ ...current(), [String(id)]: value })
    setUser('')
    setLimit('')
  }

  const remove = (id: number) => {
    const next = current()
    delete next[String(id)]
    save.mutate(next)
  }

  const limitLabel = (value: number) => (value === 0 ? t('Unlimited') : value)

  return (
    <Panel
      title={t('Concurrency limits')}
      description={t(
        'A user limit replaces the group limit for that user, across all of their API keys. 0 means unlimited. Changes apply to the next request.'
      )}
    >
      <div className='grid gap-4'>
        <p className='text-muted-foreground text-xs'>
          {t('Group limits')}:{' '}
          {groups.length > 0
            ? groups
                .map(([group, value]) => `${group} ${limitLabel(value)}`)
                .join(' · ')
            : t('None')}
          {' · '}
          {t('Set them in System Settings → Security → Token Limits.')}
        </p>
        <form
          className='flex flex-wrap items-end gap-2'
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <Input
            className='w-56'
            placeholder={t('User ID or username')}
            aria-label={t('User ID or username')}
            value={user}
            onChange={(event) => setUser(event.target.value)}
          />
          <Input
            className='w-32'
            type='number'
            min={0}
            step={1}
            placeholder={t('Limit')}
            aria-label={t('Limit')}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
          <Button
            type='submit'
            size='sm'
            disabled={!user.trim() || limit === '' || save.isPending}
          >
            {t('Set limit')}
          </Button>
        </form>
        <SimpleTable
          rows={overrides}
          rowKey={(row) => row.user_id}
          empty={t('No user has its own limit; every user follows its group.')}
          columns={[
            {
              key: 'user',
              label: t('User'),
              render: (row) => <UserLabel {...row} />,
            },
            { key: 'group', label: t('Group'), render: (row) => row.group },
            {
              key: 'limit',
              label: t('User limit'),
              align: 'right',
              render: (row) => limitLabel(row.limit),
            },
            {
              key: 'group_limit',
              label: t('Group limit'),
              align: 'right',
              render: (row) => limitLabel(row.group_limit),
            },
            {
              key: 'in_flight',
              label: t('In flight'),
              align: 'right',
              render: (row) => row.in_flight,
            },
            {
              key: 'remove',
              label: '',
              align: 'right',
              render: (row) => (
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('Remove')}
                  disabled={save.isPending}
                  onClick={() => remove(row.user_id)}
                >
                  <Trash2 />
                </Button>
              ),
            },
          ]}
        />
      </div>
    </Panel>
  )
}
