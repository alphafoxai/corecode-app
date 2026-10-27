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
/**
 * CoreCode: how many requests the customer may run at once, and how much more
 * paid in total raises it. Shown on the wallet so the tiers are seen where
 * customers top up.
 */
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  formatPaymentMoney,
  nextConcurrencyTier,
  sortedConcurrencyTiers,
} from '../lib'
import type { UserConcurrency } from '../types'

export function ConcurrencyTierCard(props: {
  info: UserConcurrency | undefined
}) {
  const { t } = useTranslation()
  const info = props.info
  if (!info || info.limit === 0) return null
  const tiers = sortedConcurrencyTiers(info)
  const next = nextConcurrencyTier(info)
  const steps = [
    {
      key: 'base',
      label: t('Default'),
      limit: info.group_limit,
      reached: true,
    },
    ...tiers.map((tier) => ({
      key: String(tier.min_paid),
      label: t('Paid {{amount}} in total', {
        amount: formatPaymentMoney(tier.min_paid),
      }),
      limit: tier.limit,
      reached: info.paid_total >= tier.min_paid,
    })),
  ]
  const progress = next ? Math.min(info.paid_total / next.min_paid, 1) : 1

  return (
    <section
      aria-labelledby='wallet-concurrency-title'
      className='bg-card grid gap-4 rounded-2xl border p-4 shadow-xs sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-center'
    >
      <div className='flex min-w-0 flex-col gap-1.5'>
        <h2
          id='wallet-concurrency-title'
          className='text-muted-foreground font-sans text-sm font-medium tracking-normal'
        >
          {t('Concurrency limit')}
        </h2>
        <p className='text-[2.25rem] leading-none font-semibold tracking-tight tabular-nums'>
          {info.limit}
        </p>
        <p className='text-muted-foreground text-xs'>
          {t('Requests at once, across all of your API keys')}
        </p>
      </div>

      {info.source === 'user' || tiers.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {info.source === 'user'
            ? t('Your limit was set for your account.')
            : t('Contact us if you need more requests at once.')}
        </p>
      ) : (
        <div className='grid gap-3'>
          <ol className='grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2'>
            {steps.map((step) => (
              <li
                key={step.key}
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg border px-3 py-2',
                  step.limit === info.limit
                    ? 'border-foreground bg-foreground/5'
                    : 'border-muted'
                )}
              >
                <span className='text-muted-foreground flex items-center gap-1 truncate text-xs'>
                  {step.reached && (
                    <Check className='size-3 shrink-0' aria-hidden />
                  )}
                  {step.label}
                </span>
                <span className='text-base font-semibold tabular-nums'>
                  {t('{{count}} at once', { count: step.limit })}
                </span>
              </li>
            ))}
          </ol>
          <div className='grid gap-1.5'>
            <div
              className='bg-muted h-1.5 overflow-hidden rounded-full'
              role='progressbar'
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label={t('Paid toward the next tier')}
            >
              <div
                className='bg-primary h-full rounded-full'
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              {next
                ? t(
                    'Paid {{paid}} in total. Top up {{remaining}} more to run {{limit}} at once.',
                    {
                      paid: formatPaymentMoney(info.paid_total),
                      remaining: formatPaymentMoney(next.remaining),
                      limit: next.limit,
                    }
                  )
                : t('Paid {{paid}} in total. You are on the highest tier.', {
                    paid: formatPaymentMoney(info.paid_total),
                  })}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
