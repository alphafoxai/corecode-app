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
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'zhCN', label: '中文' },
] as const

/**
 * CoreCode fork: an EN / 中文 pill instead of upstream's seven-language menu.
 * Any Chinese variant lights 中文; every other language lights EN. The
 * profile page still offers the full list.
 */
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const current = i18n.language?.startsWith('zh') ? 'zhCN' : 'en'
  const handleChangeLanguage = useCallback(
    async (code: string) => {
      await i18n.changeLanguage(code)
      if (user) {
        try {
          await api.put('/api/user/self', { language: code })
        } catch {
          // Best-effort persistence; don't block the UI on failure
        }
      }
    },
    [i18n, user]
  )

  return (
    <div
      role='group'
      aria-label={t('Change language')}
      className='bg-muted inline-flex h-8 shrink-0 items-center rounded-full p-0.5'
    >
      {OPTIONS.map((option) => {
        const active = option.code === current
        return (
          <button
            key={option.code}
            type='button'
            aria-pressed={active}
            onClick={() => {
              if (!active) handleChangeLanguage(option.code)
            }}
            className={cn(
              'focus-visible:ring-ring/50 h-full rounded-full px-3 text-sm transition-colors outline-none focus-visible:ring-[3px]',
              active
                ? 'bg-background text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
