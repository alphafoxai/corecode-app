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
import type { StatusBadgeProps } from '@/components/status-badge'

import type { EnterpriseApplicationStatus } from './types'

export const APPLICATIONS_KEY = ['enterprise-applications'] as const

/** `label` is the i18n key for each status. */
export const APPLICATION_STATUS_CONFIG: Record<
  EnterpriseApplicationStatus,
  { label: string; variant: StatusBadgeProps['variant'] }
> = {
  pending: { label: 'Pending', variant: 'warning' },
  contacted: { label: 'Contacted', variant: 'info' },
  won: { label: 'Won', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'neutral' },
}

export const APPLICATION_STATUSES = Object.keys(
  APPLICATION_STATUS_CONFIG
) as EnterpriseApplicationStatus[]
