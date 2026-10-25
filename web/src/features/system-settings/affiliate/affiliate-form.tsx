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
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
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
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsFormGrid,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { useUpdateOption } from '../hooks/use-update-option'

// Mirrors ValidateAffiliateOption on the server.
const affiliateSchema = z
  .object({
    enabled: z.boolean(),
    self_serve_rate: z.number().int().min(0).max(100),
    self_serve_min_topup: z.number().int().min(0),
    max_rate: z.number().int().min(0).max(100),
    second_level_rate: z.number().int().min(0).max(100),
    min_withdrawal: z.number().int().min(0),
  })
  .refine((v) => v.self_serve_rate <= v.max_rate, {
    path: ['self_serve_rate'],
    message: 'Self-serve rate cannot exceed the maximum rate',
  })

type AffiliateFormValues = z.output<typeof affiliateSchema>

export type AffiliateValues = {
  'affiliate_setting.enabled': boolean
  'affiliate_setting.self_serve_rate': number
  'affiliate_setting.self_serve_min_topup': number
  'affiliate_setting.max_rate': number
  'affiliate_setting.second_level_rate': number
  'affiliate_setting.min_withdrawal': number
}

type AffiliateFormProps = {
  defaultValues: AffiliateValues
}

const toFormValues = (d: AffiliateValues): AffiliateFormValues => ({
  enabled: d['affiliate_setting.enabled'],
  self_serve_rate: d['affiliate_setting.self_serve_rate'],
  self_serve_min_topup: d['affiliate_setting.self_serve_min_topup'],
  max_rate: d['affiliate_setting.max_rate'],
  second_level_rate: d['affiliate_setting.second_level_rate'],
  min_withdrawal: d['affiliate_setting.min_withdrawal'],
})

const toOptionValues = (v: AffiliateFormValues): AffiliateValues => ({
  'affiliate_setting.enabled': v.enabled,
  'affiliate_setting.self_serve_rate': v.self_serve_rate,
  'affiliate_setting.self_serve_min_topup': v.self_serve_min_topup,
  'affiliate_setting.max_rate': v.max_rate,
  'affiliate_setting.second_level_rate': v.second_level_rate,
  'affiliate_setting.min_withdrawal': v.min_withdrawal,
})

type NumberName = Exclude<keyof AffiliateFormValues, 'enabled'>

export function AffiliateForm(props: AffiliateFormProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<AffiliateFormValues, unknown, AffiliateFormValues>({
    resolver: zodResolver(affiliateSchema),
    mode: 'onChange',
    defaultValues: toFormValues(props.defaultValues),
  })

  useEffect(() => {
    form.reset(toFormValues(props.defaultValues))
  }, [props.defaultValues, form])

  const onSubmit = async (values: AffiliateFormValues) => {
    const normalized = toOptionValues(values)
    for (const key of Object.keys(normalized) as Array<keyof AffiliateValues>) {
      const value = normalized[key]
      if (value !== props.defaultValues[key]) {
        await updateOption.mutateAsync({ key, value })
      }
    }
  }

  const numberField = (
    name: NumberName,
    label: string,
    description: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type='number'
              min={0}
              step={1}
              {...field}
              onChange={(e) =>
                field.onChange(Number.parseInt(e.target.value, 10) || 0)
              }
            />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
        <SettingsPageFormActions
          onSave={form.handleSubmit(onSubmit)}
          isSaving={updateOption.isPending}
          saveLabel='Save invitation settings'
        />
        <FormField
          control={form.control}
          name='enabled'
          render={({ field }) => (
            <SettingsSwitchItem>
              <SettingsSwitchContent>
                <FormLabel>{t('Enable invitation program')}</FormLabel>
                <FormDescription>
                  {t(
                    'Customers whose paid top-ups reach the threshold can apply and earn commission on what their invitees pay for and use. Turning it off hides the program; earned commission is kept.'
                  )}
                </FormDescription>
              </SettingsSwitchContent>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </SettingsSwitchItem>
          )}
        />
        <SettingsFormGrid>
          {numberField(
            'self_serve_rate',
            t('Self-serve rate (%)'),
            t('Commission rate given to customers who apply themselves.')
          )}
          {numberField(
            'self_serve_min_topup',
            t('Top-up needed to apply'),
            t(
              'Gateway-paid top-ups a customer needs before they can apply, in the payment currency.'
            )
          )}
          {numberField(
            'max_rate',
            t('Maximum rate (%)'),
            t(
              'The highest commission rate an administrator can set for a user.'
            )
          )}
          {numberField(
            'second_level_rate',
            t('Second-level rate (%)'),
            t(
              'Extra commission promotion channels earn from users their invitees invite.'
            )
          )}
          {numberField(
            'min_withdrawal',
            t('Minimum withdrawal'),
            t(
              'The smallest cash payout a promotion channel can request, in the payment currency.'
            )
          )}
        </SettingsFormGrid>
      </SettingsForm>
    </Form>
  )
}
