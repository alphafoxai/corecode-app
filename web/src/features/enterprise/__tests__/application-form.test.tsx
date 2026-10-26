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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { EnterpriseApplicationForm } from '../components/enterprise-application-form'

function renderForm() {
  const onSubmitted = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // No Turnstile configured, so the form submits without a token.
  client.setQueryData(['status'], {})
  render(
    <QueryClientProvider client={client}>
      <EnterpriseApplicationForm onSubmitted={onSubmitted} />
    </QueryClientProvider>
  )
  return { onSubmitted }
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Company name/), ' Acme Ltd ')
  await user.type(screen.getByLabelText(/Contact name/), 'Lin')
  await user.type(screen.getByLabelText(/Work email/), 'lin@acme.example')
  await user.selectOptions(
    screen.getByLabelText(/Estimated monthly spend/),
    '5k_20k'
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('submitting an empty form marks the required fields and sends nothing', async () => {
  const post = vi.spyOn(api, 'post')
  renderForm()
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Submit application' }))

  expect(
    await screen.findByText('Please enter your company name')
  ).toBeVisible()
  expect(screen.getByText('Please enter a contact name')).toBeVisible()
  expect(
    screen.getByText('Please choose your estimated monthly spend')
  ).toBeVisible()
  expect(screen.getByLabelText(/Company name/)).toHaveAttribute(
    'aria-invalid',
    'true'
  )
  expect(post).not.toHaveBeenCalled()
})

it('a complete form posts the trimmed application and reports the email', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, message: '' } })
  const { onSubmitted } = renderForm()
  const user = userEvent.setup()

  await fillRequired(user)
  await user.click(screen.getByRole('button', { name: 'Submit application' }))

  await waitFor(() =>
    expect(onSubmitted).toHaveBeenCalledWith('lin@acme.example')
  )
  expect(post).toHaveBeenCalledWith(
    '/api/enterprise/apply',
    expect.objectContaining({
      company: 'Acme Ltd',
      contact_name: 'Lin',
      email: 'lin@acme.example',
      monthly_spend: '5k_20k',
      other_contact: '',
    }),
    { params: undefined }
  )
})

it('a rejected submission keeps the form for another try', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: false,
      message: 'Too many applications, please try again later.',
    },
  })
  const { onSubmitted } = renderForm()
  const user = userEvent.setup()

  await fillRequired(user)
  await user.click(screen.getByRole('button', { name: 'Submit application' }))

  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Submit application' })
    ).toBeEnabled()
  )
  expect(onSubmitted).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/Company name/)).toHaveValue(' Acme Ltd ')
})
