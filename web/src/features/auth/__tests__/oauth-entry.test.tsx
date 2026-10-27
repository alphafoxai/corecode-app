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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { SignIn } from '../sign-in'
import { MagicLinkForm } from '../sign-in/components/magic-link-form'
import { SignUp } from '../sign-up'

// The sign-in page reads its search from the '/(auth)/sign-in' route id, so the
// harness mounts pages under the same pathless group the file routes use.
function renderAuthPage(
  component: () => React.JSX.Element,
  path: '/sign-in' | '/sign-up',
  status: Record<string, unknown>
) {
  const root = createRootRoute({ component: Outlet })
  const group = createRoute({ getParentRoute: () => root, id: '(auth)' })
  const page = createRoute({ getParentRoute: () => group, path, component })
  const router = createRouter({
    routeTree: root.addChildren([group.addChildren([page])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, status)
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

const linkWithLinuxDO = {
  magic_link_enabled: true,
  magic_link_register_enabled: true,
  linuxdo_oauth: true,
  linuxdo_client_id: 'linuxdo-client',
}

afterEach(() => {
  cleanup()
})

describe('sign-in OAuth entry', () => {
  it('shows LinuxDO beside the emailed link without opening another view', async () => {
    renderAuthPage(SignIn, '/sign-in', linkWithLinuxDO)

    expect(
      await screen.findByRole('button', { name: /Continue with LinuxDO/ })
    ).toBeEnabled()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('marks the OIDC slot as Google when it points at Google', async () => {
    renderAuthPage(SignIn, '/sign-in', {
      ...linkWithLinuxDO,
      oidc_enabled: true,
      oidc_display_name: 'Google',
      oidc_client_id: 'google-client',
      oidc_authorization_endpoint:
        'https://accounts.google.com/o/oauth2/v2/auth',
    })

    const google = await screen.findByRole('button', {
      name: /Continue with Google/,
    })
    expect(google.querySelector('title')?.textContent).toBe('Google')
  })

  it('keeps the password form reachable when OAuth is the only other provider', async () => {
    renderAuthPage(SignIn, '/sign-in', {
      ...linkWithLinuxDO,
      password_login_enabled: true,
    })
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: 'Sign in another way' })
    )

    expect(
      await screen.findByLabelText('Username or Email')
    ).toBeInTheDocument()
  })

  it('drops the second view when the password form is off and OAuth is already shown', async () => {
    renderAuthPage(SignIn, '/sign-in', {
      ...linkWithLinuxDO,
      password_login_enabled: false,
    })

    await screen.findByRole('button', { name: /Continue with LinuxDO/ })
    expect(
      screen.queryByRole('button', { name: 'Sign in another way' })
    ).not.toBeInTheDocument()
  })
})

describe('sign-up OAuth entry', () => {
  it('offers LinuxDO above the emailed link when OAuth may register', async () => {
    renderAuthPage(SignUp, '/sign-up', linkWithLinuxDO)

    expect(
      await screen.findByRole('button', { name: /Continue with LinuxDO/ })
    ).toBeInTheDocument()
  })

  it('hides OAuth when the operator turned OAuth registration off', async () => {
    renderAuthPage(SignUp, '/sign-up', {
      ...linkWithLinuxDO,
      oauth_register_enabled: false,
    })

    await screen.findByLabelText('Email')
    expect(
      screen.queryByRole('button', { name: /Continue with LinuxDO/ })
    ).not.toBeInTheDocument()
  })
})

describe('MagicLinkForm OAuth consent', () => {
  it('starts agreed and holds OAuth once the legal terms are unchecked', async () => {
    renderAuthPage(() => <MagicLinkForm showOAuthProviders />, '/sign-in', {
      ...linkWithLinuxDO,
      user_agreement_enabled: true,
    })
    const user = userEvent.setup()
    const linuxDO = await screen.findByRole('button', {
      name: /Continue with LinuxDO/,
    })
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(linuxDO).toBeEnabled()

    await user.click(screen.getByRole('checkbox'))

    expect(linuxDO).toBeDisabled()
  })
})
