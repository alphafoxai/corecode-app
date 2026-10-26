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
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Turnstile } from '@/components/turnstile'
import { Button } from '@/components/ui/button'
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useTurnstile } from '@/features/auth'
import { handleServerError } from '@/lib/handle-server-error'

import { submitEnterpriseApplication } from '../api'
import { ENTERPRISE_SPEND_BANDS } from '../constants'
import {
  enterpriseApplicationSchema,
  type EnterpriseApplicationValues,
} from '../lib/schema'

const EMPTY_APPLICATION: EnterpriseApplicationValues = {
  company: '',
  contact_name: '',
  email: '',
  other_contact: '',
  monthly_spend: '',
  use_case: '',
  message: '',
}

type EnterpriseApplicationFormProps = {
  /** Called with the email the team will be reached at */
  onSubmitted: (email: string) => void
}

export function EnterpriseApplicationForm(
  props: EnterpriseApplicationFormProps
) {
  const { t } = useTranslation()
  const turnstile = useTurnstile()
  const form = useForm<EnterpriseApplicationValues>({
    resolver: zodResolver(enterpriseApplicationSchema),
    defaultValues: EMPTY_APPLICATION,
  })
  const submitting = form.formState.isSubmitting
  const turnstileReady =
    !turnstile.isTurnstileEnabled || Boolean(turnstile.turnstileToken)

  async function onSubmit(values: EnterpriseApplicationValues) {
    if (!turnstile.validateTurnstile()) return
    try {
      await submitEnterpriseApplication(values, turnstile.turnstileToken)
      props.onSubmitted(values.email)
    } catch (error) {
      handleServerError(error, t('Failed to submit application'))
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='grid gap-4 sm:grid-cols-2'
        noValidate
      >
        <FormField
          control={form.control}
          name='company'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Company name')} *</FormLabel>
              <FormControl>
                <Input autoComplete='organization' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='contact_name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Contact name')} *</FormLabel>
              <FormControl>
                <Input autoComplete='name' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Work email')} *</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  autoComplete='email'
                  placeholder='name@company.com'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('We send your quote to this address.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='other_contact'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Telegram, WeChat or phone')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {t('Optional, for a faster reply.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='monthly_spend'
          render={({ field }) => (
            <FormItem className='sm:col-span-2'>
              <FormLabel>{t('Estimated monthly spend')} *</FormLabel>
              <FormControl>
                <NativeSelect className='w-full' {...field}>
                  <NativeSelectOption value='' disabled>
                    {t('Choose a range')}
                  </NativeSelectOption>
                  {ENTERPRISE_SPEND_BANDS.map((band) => (
                    <NativeSelectOption key={band.value} value={band.value}>
                      {t(band.labelKey)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='use_case'
          render={({ field }) => (
            <FormItem className='sm:col-span-2'>
              <FormLabel>{t('Models and use case')}</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder={t(
                    'For example: Claude Sonnet for code review in CI, about 2,000 requests a day'
                  )}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='message'
          render={({ field }) => (
            <FormItem className='sm:col-span-2'>
              <FormLabel>{t('Anything else')}</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {turnstile.isTurnstileEnabled && (
          <div className='sm:col-span-2'>
            <Turnstile
              siteKey={turnstile.turnstileSiteKey}
              onVerify={turnstile.setTurnstileToken}
            />
          </div>
        )}
        <Button
          type='submit'
          className='sm:col-span-2'
          disabled={submitting || !turnstileReady}
        >
          {submitting && (
            <Loader2 className='animate-spin' aria-hidden='true' />
          )}
          {t('Submit application')}
        </Button>
      </form>
    </Form>
  )
}
