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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { MultiSelect } from '@/components/multi-select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { getGroups } from '@/features/users/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

export type ClaudeCodeClientSettings = {
  'claude_code_client_setting.groups': string
  'claude_code_client_setting.min_version': string
  'claude_code_client_setting.max_version': string
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

function compareVersions(a: string, b: string) {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i]
  }
  return 0
}

const versionField = z
  .string()
  .trim()
  .refine((value) => value === '' || VERSION_PATTERN.test(value), {
    message: 'Use the form x.y.z, for example 2.1.78',
  })

const claudeCodeClientSchema = z
  .object({
    groups: z.array(z.string()),
    minVersion: versionField,
    maxVersion: versionField,
  })
  .refine(
    ({ minVersion, maxVersion }) =>
      minVersion === '' ||
      maxVersion === '' ||
      compareVersions(minVersion, maxVersion) <= 0,
    {
      message: 'The minimum version cannot be higher than the maximum version',
      path: ['maxVersion'],
    }
  )

type ClaudeCodeClientFormValues = z.output<typeof claudeCodeClientSchema>
type ClaudeCodeClientFormInput = z.input<typeof claudeCodeClientSchema>

function parseGroups(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((group): group is string => typeof group === 'string')
      : []
  } catch {
    return []
  }
}

type ClaudeCodeClientsSectionProps = {
  defaultValues: ClaudeCodeClientSettings
}

export function ClaudeCodeClientsSection({
  defaultValues,
}: ClaudeCodeClientsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const formDefaults = useMemo<ClaudeCodeClientFormInput>(
    () => ({
      groups: parseGroups(defaultValues['claude_code_client_setting.groups']),
      minVersion: defaultValues['claude_code_client_setting.min_version'],
      maxVersion: defaultValues['claude_code_client_setting.max_version'],
    }),
    [defaultValues]
  )
  const form = useForm<
    ClaudeCodeClientFormInput,
    unknown,
    ClaudeCodeClientFormValues
  >({
    resolver: zodResolver(claudeCodeClientSchema),
    mode: 'onChange',
    defaultValues: formDefaults,
  })

  useEffect(() => {
    form.reset(formDefaults)
  }, [formDefaults, form])

  const { data: groupsResponse } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => requireServerSuccess(await getGroups()),
  })
  const selectedGroups = form.watch('groups')
  const groupOptions = useMemo(() => {
    const names = new Set(
      (groupsResponse?.data ?? []).filter((group) => group !== 'auto')
    )
    // Keep groups that were restricted and later removed visible, so they can
    // be cleared.
    for (const group of selectedGroups) names.add(group)
    return [...names].map((group) => ({ label: group, value: group }))
  }, [groupsResponse?.data, selectedGroups])

  const onSubmit = async (values: ClaudeCodeClientFormValues) => {
    const updates: Array<[keyof ClaudeCodeClientSettings, string]> = [
      ['claude_code_client_setting.groups', JSON.stringify(values.groups)],
      ['claude_code_client_setting.min_version', values.minVersion],
      ['claude_code_client_setting.max_version', values.maxVersion],
    ]
    for (const [key, value] of updates) {
      const current =
        key === 'claude_code_client_setting.groups'
          ? JSON.stringify(parseGroups(defaultValues[key]))
          : defaultValues[key]
      if (value !== current) {
        await updateOption.mutateAsync({ key, value })
      }
    }
  }

  return (
    <SettingsSection title={t('Claude Code clients')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Requests in the selected groups must come from the Claude Code CLI, judged by its User-Agent, headers, system prompt and metadata. Other clients get a 403 before channel selection and are not billed. A client that copies these fields can still pass.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save Claude Code client settings'
          />
          <FormField
            control={form.control}
            name='groups'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Claude Code only groups')}</FormLabel>
                <FormControl>
                  <MultiSelect
                    options={groupOptions}
                    selected={field.value}
                    onChange={field.onChange}
                    placeholder={t('Select groups')}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Tokens in these groups accept Claude Code only. An auto token is checked when any of its candidate groups is listed.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='minVersion'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Minimum Claude Code version')}</FormLabel>
                <FormControl>
                  <Input placeholder='2.1.78' {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    'Applies to the groups above. Leave blank for no minimum.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='maxVersion'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Maximum Claude Code version')}</FormLabel>
                <FormControl>
                  <Input placeholder='2.1.301' {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    'Applies to the groups above. Leave blank for no maximum.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
