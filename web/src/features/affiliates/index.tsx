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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MetricGrid } from '@/features/site-insights/components/shared'
import { formatPaymentMoney } from '@/features/wallet/lib'
import { formatQuota } from '@/lib/format'

import { getAffiliateOverview } from './api'
import { AffiliateList } from './components/affiliate-list'
import { AffiliateSettings } from './components/affiliate-settings'
import { AffiliateWithdrawals } from './components/affiliate-withdrawals'

const route = getRouteApi('/_authenticated/affiliates/')

export const AFFILIATE_TABS = ['affiliates', 'withdrawals', 'settings'] as const
export type AffiliateTab = (typeof AFFILIATE_TABS)[number]

/**
 * The root-only invitation program page: who invites and how well, the
 * channels' withdrawal requests, and the program's terms.
 */
export function Affiliates() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const tab = search.tab ?? 'affiliates'

  const overview = useQuery({
    queryKey: ['affiliate', 'admin-overview'],
    queryFn: getAffiliateOverview,
  })
  const data = overview.data

  const tabLabels: Record<AffiliateTab, string> = {
    affiliates: t('Affiliates'),
    withdrawals: t('Withdrawals'),
    settings: t('Settings'),
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Invitation program')}</span>
          <Badge variant='outline' className='shrink-0'>
            Root
          </Badge>
          {data && !data.enabled && (
            <Badge variant='secondary' className='shrink-0'>
              {t('Off')}
            </Badge>
          )}
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='grid gap-4'>
          <MetricGrid
            loading={overview.isPending}
            items={[
              {
                label: t('Inviters'),
                value: data?.overview.inviters ?? 0,
                hint: t('{{count}} promotion channels', {
                  count: data?.overview.channels ?? 0,
                }),
              },
              {
                label: t('Invitees'),
                value: data?.overview.invitees ?? 0,
              },
              {
                label: t('Total Earned'),
                value: formatQuota(data?.overview.earned ?? 0),
                hint: formatPaymentMoney(data?.earned_money ?? 0),
              },
              {
                label: t('Commission balance'),
                value: formatQuota(data?.overview.balance ?? 0),
                hint: formatPaymentMoney(data?.balance_money ?? 0),
              },
              {
                label: t('Pending withdrawals'),
                value: data?.overview.pending_withdrawals ?? 0,
                hint: formatPaymentMoney(data?.pending_withdrawal_money ?? 0),
                tone: data?.overview.pending_withdrawals
                  ? 'warning'
                  : 'default',
              },
              {
                label: t('Rates'),
                value: data
                  ? `${data.self_serve_rate}% / ${data.max_rate}%`
                  : '-',
                hint: t('Default / maximum; second level {{rate}}%', {
                  rate: data?.second_level_rate ?? 0,
                }),
              },
            ]}
          />
          <Tabs
            value={tab}
            onValueChange={(value) =>
              navigate({
                search: (prev) => ({ ...prev, tab: value as AffiliateTab }),
              })
            }
          >
            <TabsList>
              {AFFILIATE_TABS.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {tabLabels[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {tab === 'affiliates' && <AffiliateList />}
          {tab === 'withdrawals' && <AffiliateWithdrawals />}
          {tab === 'settings' && <AffiliateSettings />}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
