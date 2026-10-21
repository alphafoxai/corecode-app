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
 * CoreCode fork: the balance stays in view on every console page, so a
 * customer notices a low balance before Claude Code starts failing with 403.
 */
import { Link } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export function SidebarBalance() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  if (!user) return null

  const balance = Number(user.quota ?? 0)
  const amount = formatQuota(balance)
  const label = `${t('Balance')} ${amount}`

  return (
    <SidebarFooter className='border-sidebar-border/70 border-t'>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size='lg'
            tooltip={label}
            aria-label={label}
            render={<Link to='/wallet' />}
          >
            <span
              className={cn(
                'bg-sidebar-accent flex size-8 shrink-0 items-center justify-center rounded-lg',
                balance <= 0 && 'bg-destructive/10 text-destructive'
              )}
            >
              <Wallet className='size-4' aria-hidden />
            </span>
            <span className='flex min-w-0 flex-col leading-tight'>
              <span className='text-sidebar-foreground/60 text-xs'>
                {t('Balance')}
              </span>
              <span
                className={cn(
                  'truncate text-sm font-semibold tabular-nums',
                  balance <= 0 && 'text-destructive'
                )}
              >
                {amount}
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
