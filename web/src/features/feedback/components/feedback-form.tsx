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
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { handleServerError } from '@/lib/handle-server-error'

import { submitFeedback } from '../api'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_CONFIG,
  MY_FEEDBACK_KEY,
} from '../constants'
import { feedbackSchema, type FeedbackValues } from '../lib/schema'

const EMPTY_FEEDBACK: FeedbackValues = {
  category: 'bug',
  title: '',
  description: '',
  related_request: '',
  contact: '',
}

/** Files a report; the server attaches the browser and recent requests. */
export function FeedbackForm() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<FeedbackValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: EMPTY_FEEDBACK,
  })
  const submitting = form.formState.isSubmitting

  async function onSubmit(values: FeedbackValues) {
    try {
      await submitFeedback(values)
    } catch (error) {
      handleServerError(error, t('Failed to submit feedback'))
      return
    }
    toast.success(t('Thanks, we received your feedback'))
    form.reset(EMPTY_FEEDBACK)
    await queryClient.invalidateQueries({ queryKey: MY_FEEDBACK_KEY })
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
          name='category'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Type')} *</FormLabel>
              <FormControl>
                <NativeSelect className='w-full' {...field}>
                  {FEEDBACK_CATEGORIES.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {t(FEEDBACK_CATEGORY_CONFIG[value].label)}
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
          name='title'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Title')} *</FormLabel>
              <FormControl>
                <Input maxLength={128} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='description'
          render={({ field }) => (
            <FormItem className='sm:col-span-2'>
              <FormLabel>{t('Description')} *</FormLabel>
              <FormControl>
                <Textarea
                  rows={5}
                  maxLength={4000}
                  placeholder={t(
                    'What you did, what you expected, and what happened instead. Paste the error message if there is one.'
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
          name='related_request'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Related request')}</FormLabel>
              <FormControl>
                <Input maxLength={128} {...field} />
              </FormControl>
              <FormDescription>
                {t('The time or request ID from Usage Logs, if any.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='contact'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('QQ, WeChat or email')}</FormLabel>
              <FormControl>
                <Input maxLength={128} {...field} />
              </FormControl>
              <FormDescription>
                {t('Optional, if you would like us to reach you.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit' className='sm:col-span-2' disabled={submitting}>
          {submitting && (
            <Loader2 className='animate-spin' aria-hidden='true' />
          )}
          {t('Submit feedback')}
        </Button>
      </form>
    </Form>
  )
}
