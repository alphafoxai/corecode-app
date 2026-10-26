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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAffiliate } from '@/features/wallet/hooks/use-affiliate'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'

import type { InviteeTotals } from '../types'

type InvitationOverviewProps = {
  inviteeCount: number
  totals: InviteeTotals
  loading: boolean
}

export function InvitationOverview(props: InvitationOverviewProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const aff = useAffiliate()
  const account = aff.summary?.affiliate ?? null

  const stats = [
    [t('Invites'), formatNumber(props.inviteeCount, locale)],
    [t('Invitee spend'), formatQuota(props.totals.used_quota)],
    [t('Commission from invitees'), formatQuota(props.totals.commission)],
    [t('Commission balance'), formatQuota(account?.balance ?? 0)],
  ] as const

  let link: React.ReactNode = (
    <p className='text-muted-foreground text-xs'>
      {t('Apply for invitation commission in the wallet to get a link.')}{' '}
      <Link
        to='/wallet'
        className='text-primary underline-offset-4 hover:underline'
      >
        {t('Go to wallet')}
      </Link>
    </p>
  )
  if (aff.loading) {
    link = <Skeleton className='h-9 rounded-lg' />
  } else if (aff.affiliateLink) {
    link = (
      <div className='flex items-center gap-2'>
        <Input
          value={aff.affiliateLink}
          readOnly
          aria-label={t('Referral link')}
          className='border-muted bg-background/70 h-9 min-w-0 flex-1 font-mono text-xs'
        />
        <CopyButton
          value={aff.affiliateLink}
          variant='outline'
          className='bg-background size-9 shrink-0'
          iconClassName='size-4'
          tooltip={t('Copy referral link')}
          aria-label={t('Copy referral link')}
        />
      </div>
    )
  }

  return (
    <Card data-card-hover='false' className='bg-muted/20 py-0'>
      <CardContent className='grid gap-3 p-3 sm:gap-4 sm:p-4'>
        {link}
        <dl className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          {stats.map(([label, value]) => (
            <div key={label} className='min-w-0'>
              <dt className='text-muted-foreground truncate text-xs'>
                {label}
              </dt>
              <dd className='mt-0.5 truncate text-base font-semibold tabular-nums'>
                {props.loading ? <Skeleton className='h-6 w-20' /> : value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
