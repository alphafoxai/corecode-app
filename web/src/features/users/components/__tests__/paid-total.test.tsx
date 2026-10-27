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
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it } from 'vitest'

import { formatPaymentMoney } from '@/features/wallet/lib'

import type { User } from '../../types'
import { useUsersColumns } from '../users-columns'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  initAsync: false,
})

function PaidTotalTable(props: { paid?: number }) {
  const columns = useUsersColumns().filter(
    (column) => column.id === 'paid_total'
  )
  const table = useReactTable({
    columns,
    data: [
      {
        id: 1,
        username: 'test',
        display_name: '',
        role: 1,
        status: 1,
        quota: 0,
        used_quota: 0,
        request_count: 0,
        group: 'default',
        paid_total: props.paid,
      } as User,
    ],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id} data-sortable={header.column.getCanSort()}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext()
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderPaidTotal(paid?: number) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PaidTotalTable paid={paid} />
    </I18nextProvider>
  )
}

afterEach(cleanup)

it('shows what a user paid in the payment currency, sortable', () => {
  renderPaidTotal(150.5)

  const header = screen.getByRole('columnheader', { name: 'Total Paid' })
  expect(header).toHaveAttribute('data-sortable', 'true')
  expect(screen.getByRole('cell')).toHaveTextContent(formatPaymentMoney(150.5))
})

it.each([0, undefined])(
  'shows a dash for a user who has paid nothing (paid=%s)',
  (paid) => {
    renderPaidTotal(paid)

    expect(screen.getByRole('cell')).toHaveTextContent('—')
  }
)
