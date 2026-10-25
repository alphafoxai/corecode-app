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
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { getAffiliateCommissions, getAffiliateWithdrawals } from '../../api'
import {
  useCommissionColumns,
  useWithdrawalColumns,
} from '../affiliate-columns'
import { AffiliatePagedTable } from '../affiliate-paged-table'

type AffiliateRecordsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Channels also see their withdrawal history. */
  showWithdrawals: boolean
}

export function AffiliateRecordsDialog(props: AffiliateRecordsDialogProps) {
  const { t } = useTranslation()
  const commissionColumns = useCommissionColumns()
  const withdrawalColumns = useWithdrawalColumns()

  const commissions = (
    <AffiliatePagedTable
      queryKey={['affiliate', 'commissions']}
      load={getAffiliateCommissions}
      columns={commissionColumns}
      emptyTitle={t('No commission records yet')}
      enabled={props.open}
    />
  )

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Commission records')}
      description={t('Commission is settled hourly.')}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-3xl'
      bodyClassName='space-y-3'
    >
      {props.showWithdrawals ? (
        <Tabs defaultValue='commissions'>
          <TabsList>
            <TabsTrigger value='commissions'>{t('Commissions')}</TabsTrigger>
            <TabsTrigger value='withdrawals'>{t('Withdrawals')}</TabsTrigger>
          </TabsList>
          <TabsContent value='commissions'>{commissions}</TabsContent>
          <TabsContent value='withdrawals'>
            <AffiliatePagedTable
              queryKey={['affiliate', 'withdrawals']}
              load={getAffiliateWithdrawals}
              columns={withdrawalColumns}
              emptyTitle={t('No withdrawals yet')}
              enabled={props.open}
            />
          </TabsContent>
        </Tabs>
      ) : (
        commissions
      )}
    </Dialog>
  )
}
