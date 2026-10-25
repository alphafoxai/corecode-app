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
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  formatQuota,
  parseQuotaFromDollars,
  quotaUnitsToDollars,
} from '@/lib/format'

import { formatPaymentMoney } from '../../lib'

type WithdrawDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (quota: number, account: string) => Promise<boolean>
  /** Commission balance in quota units */
  balance: number
  /** Payment currency one quota unit pays out: status `price` / `quota_per_unit` */
  moneyPerQuota: number
  /** Minimum withdrawal in payment currency */
  minMoney: number
  submitting: boolean
}

export function WithdrawDialog(props: WithdrawDialogProps) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(0)
  const [useAll, setUseAll] = useState(true)
  const [account, setAccount] = useState('')

  useEffect(() => {
    if (props.open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(quotaUnitsToDollars(props.balance))
      setUseAll(true)
      setAccount('')
    }
  }, [props.open, props.balance])

  const quota = useAll ? props.balance : parseQuotaFromDollars(amount)
  // The server prices the payout the same way and rounds down to the cent.
  const money = Math.floor(quota * props.moneyPerQuota * 100) / 100
  const canSubmit =
    quota > 0 &&
    quota <= props.balance &&
    money >= props.minMoney &&
    account.trim() !== ''

  const submit = async () => {
    if (!canSubmit) return
    if (await props.onConfirm(quota, account.trim())) {
      props.onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Withdraw commission')}
      description={t(
        'Request a cash payout of your commission. The operator pays it to the account you give.'
      )}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      bodyClassName='space-y-4'
      footerClassName='grid grid-cols-2 gap-2 sm:flex'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={props.submitting}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={props.submitting || !canSubmit}>
            {props.submitting && <Loader2 className='animate-spin' />}
            {t('Request withdrawal')}
          </Button>
        </>
      }
    >
      <div className='space-y-2'>
        <Label htmlFor='withdraw-amount'>{t('Withdrawal amount')}</Label>
        <div className='flex gap-2'>
          <Input
            id='withdraw-amount'
            type='number'
            min={0}
            value={amount}
            className='font-mono'
            onChange={(e) => {
              setUseAll(false)
              setAmount(Number(e.target.value))
            }}
          />
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setUseAll(true)
              setAmount(quotaUnitsToDollars(props.balance))
            }}
          >
            {t('All')}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('Available: {{quota}}', { quota: formatQuota(props.balance) })}
          {' · '}
          {t('Pays out {{money}}', { money: formatPaymentMoney(money) })}
        </p>
        <p className='text-muted-foreground text-xs'>
          {t('Minimum withdrawal: {{money}}', {
            money: formatPaymentMoney(props.minMoney),
          })}
        </p>
      </div>
      <div className='space-y-2'>
        <Label htmlFor='withdraw-account'>{t('Payout account')}</Label>
        <Input
          id='withdraw-account'
          value={account}
          maxLength={200}
          placeholder={t('Alipay account or bank card, with the account name')}
          onChange={(e) => setAccount(e.target.value)}
        />
      </div>
    </Dialog>
  )
}
