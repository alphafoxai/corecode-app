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

import { Dialog } from '@/components/dialog'
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

import {
  percentToRate,
  rateToPercent,
  type AmountBonusData,
} from './amount-bonus-tiers'

const createAmountBonusDialogSchema = (t: (key: string) => string) =>
  z.object({
    amount: z
      .number()
      .positive(t('Amount must be greater than 0'))
      .int(t('Amount must be a whole number')),
    bonusPercent: z
      .number()
      .min(0.01, t('Bonus must be at least 0.01%'))
      .max(100, t('Bonus must be ≤ 100%')),
  })

type AmountBonusDialogFormValues = z.infer<
  ReturnType<typeof createAmountBonusDialogSchema>
>

const AMOUNT_BONUS_FORM_ID = 'amount-bonus-form'

const EMPTY_VALUES: AmountBonusDialogFormValues = {
  amount: 0,
  bonusPercent: 0,
}

type AmountBonusDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: AmountBonusData) => void
  editData?: AmountBonusData | null
}

export function AmountBonusDialog({
  open,
  onOpenChange,
  onSave,
  editData,
}: AmountBonusDialogProps) {
  const { t } = useTranslation()
  const isEditMode = !!editData
  const amountBonusDialogSchema = createAmountBonusDialogSchema(t)

  const form = useForm<AmountBonusDialogFormValues>({
    resolver: zodResolver(amountBonusDialogSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (editData) {
      form.reset({
        amount: editData.amount,
        bonusPercent: rateToPercent(editData.rate),
      })
    } else {
      form.reset(EMPTY_VALUES)
    }
  }, [editData, form, open])

  const handleSubmit = (values: AmountBonusDialogFormValues) => {
    onSave({
      amount: values.amount,
      rate: percentToRate(values.bonusPercent),
    })
    form.reset(EMPTY_VALUES)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? t('Edit bonus tier') : t('Add bonus tier')}
      description={t(
        'Set a bonus percentage for recharges at or above an amount.'
      )}
      contentClassName='sm:max-w-[500px]'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={AMOUNT_BONUS_FORM_ID}>
            {isEditMode ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={AMOUNT_BONUS_FORM_ID}
          onSubmit={form.handleSubmit(handleSubmit)}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='amount'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Recharge Amount (USD)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    step='1'
                    min='1'
                    placeholder={t('e.g., 100')}
                    {...field}
                    onChange={(e) =>
                      field.onChange(Number.parseInt(e.target.value) || 0)
                    }
                    disabled={isEditMode}
                  />
                </FormControl>
                <FormDescription>
                  {isEditMode
                    ? t('Amount cannot be changed when editing.')
                    : t(
                        'Minimum recharge amount to qualify for this bonus. It also covers larger amounts up to the next tier.'
                      )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='bonusPercent'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Bonus Percent')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    step='0.01'
                    min='0.01'
                    max='100'
                    placeholder={t('e.g., 5')}
                    {...field}
                    onChange={(e) =>
                      field.onChange(Number.parseFloat(e.target.value) || 0)
                    }
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Extra credit as a percentage of the recharge amount (5 = 5% bonus).'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
