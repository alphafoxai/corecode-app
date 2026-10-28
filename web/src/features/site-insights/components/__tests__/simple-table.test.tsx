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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import { SimpleTable } from '../shared'

type Row = { id: number }

function table(count: number) {
  const rows: Row[] = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
  }))
  return (
    <SimpleTable<Row>
      rows={rows}
      rowKey={(row) => row.id}
      empty='none'
      columns={[{ key: 'id', label: 'ID', render: (row) => `row-${row.id}` }]}
    />
  )
}

it('pages a long table ten rows at a time', async () => {
  const user = userEvent.setup()
  const { rerender } = render(table(25))
  expect(screen.getByText('row-1')).toBeInTheDocument()
  expect(screen.queryByText('row-11')).not.toBeInTheDocument()
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Next page' }))
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByText('row-21')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()

  // A refresh that shortens the list keeps the reader on its last page.
  rerender(table(15))
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  expect(screen.getByText('row-15')).toBeInTheDocument()
})

it('shows no pager for a short table', () => {
  render(table(10))
  expect(screen.getByText('row-10')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Next page' })
  ).not.toBeInTheDocument()
})
