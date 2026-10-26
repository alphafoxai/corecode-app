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
import type { Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

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

import { FormDirtyIndicator } from '../components/form-dirty-indicator'
import { FormNavigationGuard } from '../components/form-navigation-guard'
import {
  SettingsForm,
  SettingsFormGrid,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useSettingsForm } from '../hooks/use-settings-form'
import { useUpdateOption } from '../hooks/use-update-option'

// The same formats the server enforces (setting/system_setting/analytics.go):
// each value is written into a script tag of every console page.
const GOOGLE_ANALYTICS_ID = /^G-[A-Z0-9]{4,20}$/
const UMAMI_WEBSITE_ID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function isHttpsScriptUrl(value: string): boolean {
  if (value === '') return true
  if (/["'<>`\\\s]/.test(value)) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.host !== '' &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}

type AnalyticsFormValues = {
  analytics_setting: {
    google_analytics_id: string
    umami_website_id: string
    umami_script_url: string
  }
}

type AnalyticsSectionProps = {
  defaultValues: AnalyticsFormValues
}

export function AnalyticsSection({ defaultValues }: AnalyticsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const schema = z.object({
    analytics_setting: z.object({
      google_analytics_id: z
        .string()
        .refine((v) => v === '' || GOOGLE_ANALYTICS_ID.test(v), {
          error: () => t('Enter a GA4 measurement ID such as G-XXXXXXXXXX'),
        }),
      umami_website_id: z
        .string()
        .refine((v) => v === '' || UMAMI_WEBSITE_ID.test(v), {
          error: () => t('Enter the Umami website ID as a UUID'),
        }),
      umami_script_url: z.string().refine(isHttpsScriptUrl, {
        error: () => t('Enter an absolute HTTPS URL'),
      }),
    }),
  })

  const { form, handleSubmit, handleReset, isDirty, isSubmitting } =
    useSettingsForm<AnalyticsFormValues>({
      resolver: zodResolver(schema) as Resolver<
        AnalyticsFormValues,
        unknown,
        AnalyticsFormValues
      >,
      defaultValues,
      onSubmit: async (_data, changedFields) => {
        for (const [key, value] of Object.entries(changedFields)) {
          await updateOption.mutateAsync({ key, value: String(value ?? '') })
        }
      },
    })

  return (
    <>
      <FormNavigationGuard when={isDirty} />

      <SettingsSection title={t('Analytics')}>
        <Form {...form}>
          <SettingsForm onSubmit={handleSubmit}>
            <SettingsPageFormActions
              onSave={handleSubmit}
              onReset={handleReset}
              isSaving={isSubmitting || updateOption.isPending}
              isResetDisabled={!isDirty}
            />
            <FormDirtyIndicator isDirty={isDirty} />
            <SettingsFormGrid>
              <FormField
                control={form.control}
                name='analytics_setting.google_analytics_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Google Analytics measurement ID')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder='G-XXXXXXXXXX' {...field} />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Adds the GA4 tag to every console page from the next page load. Leave empty to remove it.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='analytics_setting.umami_website_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Umami website ID')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='00000000-0000-0000-0000-000000000000'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Adds the Umami script to every console page from the next page load. Leave empty to remove it.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='analytics_setting.umami_script_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Umami script URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://analytics.umami.is/script.js'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'For a self-hosted Umami. Leave empty to use Umami Cloud.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SettingsFormGrid>
          </SettingsForm>
        </Form>
      </SettingsSection>
    </>
  )
}
