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
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

import { EmailLoginConfirm } from '../email-login'
import { MagicLinkForm } from '../sign-in/components/magic-link-form'
import { SignUp } from '../sign-up'

const bundle: AuthBundle = {
  access_token: 'magic-link-access-token',
  token_type: 'Bearer',
  access_expires_at: 9999999999,
  user: { id: 42, username: 'magic-user', role: 1 },
  session: {
    sid: 'magic-session',
    current: true,
    login_method: 'magic_link',
    ip: '',
    user_agent: '',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
}

function renderInRouter(
  component: () => React.JSX.Element,
  initialPath: string,
  status: Record<string, unknown> = {}
) {
  const root = createRootRoute({ component: Outlet })
  const routes = [
    createRoute({ getParentRoute: () => root, path: '/', component }),
    createRoute({
      getParentRoute: () => root,
      path: '/sign-in',
      component: () => <div>Sign-in page</div>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/dashboard',
      component: () => <div>Dashboard destination</div>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/pricing',
      component: () => <div>Pricing destination</div>,
    }),
  ]
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  // AuthLayout and the consent gate read /api/status through react-query, so the
  // harness supplies that cache entry directly.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, status)
  return {
    router,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
  }
}

// Reads the token from the router the way the real route does, so a rewrite of
// the address reaches the component as a changed prop.
function LiveSearchHarness() {
  const { token } = useSearch({ strict: false }) as { token?: string }
  return <EmailLoginConfirm token={token} />
}

function SignInHarness() {
  return <MagicLinkForm redirectTo='/pricing' />
}

async function submitEmail(user: ReturnType<typeof userEvent.setup>) {
  const emailInput = await screen.findByLabelText('Email')
  await user.type(emailInput, 'someone@example.com')
  await user.click(screen.getByRole('button', { name: /Send sign-in code/ }))
}

// input-otp probes for password-manager badges with elementFromPoint, which
// jsdom does not implement.
beforeAll(() => {
  document.elementFromPoint ??= () => null
})

afterEach(() => {
  window.localStorage.removeItem('aff')
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset('idle')
})

describe('MagicLinkForm', () => {
  it('posts the mailbox with the continuation path and confirms delivery', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, resend_after: 45 } } as never)

    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    const emailInput = await screen.findByLabelText('Email')
    await user.type(emailInput, 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /Send sign-in code/ }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/api/magic_link/send',
      { email: 'someone@example.com', redirect: '/pricing' },
      { skipAuthRefresh: true }
    )
    // The form moves to the code step for the address the mail went to.
    expect(
      await screen.findByRole('heading', { name: 'Check your email' })
    ).toBeInTheDocument()
    expect(screen.getByText('someone@example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('Sign-in code')).toBeInTheDocument()
  })

  it('keeps the invitation code collapsed until asked for and sends the typed code', async () => {
    window.localStorage.removeItem('aff')
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, resend_after: 45 } } as never)

    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    expect(screen.queryByLabelText('Invitation code (optional)')).toBeNull()
    await user.click(
      await screen.findByRole('button', { name: 'Have an invitation code?' })
    )
    await user.type(
      screen.getByLabelText('Invitation code (optional)'),
      'ab12cd'
    )
    await submitEmail(user)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith(
      '/api/magic_link/send',
      { email: 'someone@example.com', redirect: '/pricing', aff: 'ab12cd' },
      { skipAuthRefresh: true }
    )
    expect(window.localStorage.getItem('aff')).toBe('ab12cd')
  })

  it('prefills a stored invitation code and sends it', async () => {
    window.localStorage.setItem('aff', 'stored1')
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, resend_after: 45 } } as never)

    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    expect(
      await screen.findByLabelText('Invitation code (optional)')
    ).toHaveValue('stored1')
    await submitEmail(user)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]).toMatchObject({ aff: 'stored1' })
  })

  it('captures ?aff= from the address and omits aff when none is set', async () => {
    window.localStorage.removeItem('aff')
    window.history.replaceState({}, '', '/sign-in?aff=fromurl')
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, resend_after: 45 } } as never)

    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    expect(
      await screen.findByLabelText('Invitation code (optional)')
    ).toHaveValue('fromurl')
    await submitEmail(user)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]).toMatchObject({ aff: 'fromurl' })

    cleanup()
    window.history.replaceState({}, '', '/')
    window.localStorage.removeItem('aff')
    post.mockClear()
    renderInRouter(SignInHarness, '/')
    await submitEmail(userEvent.setup())
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][1]).toMatchObject({ aff: undefined })
  })

  it('reserves the resend button for the server-provided wait', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, resend_after: 45 },
    } as never)

    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    const emailInput = await screen.findByLabelText('Email')
    await user.type(emailInput, 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /Send sign-in code/ }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Resend code \(\d+s\)/ })
      ).toBeDisabled()
    )
  })

  it('withholds the link until the legal terms are accepted', async () => {
    const post = vi.spyOn(api, 'post')

    renderInRouter(SignInHarness, '/', {
      user_agreement_enabled: true,
      privacy_policy_enabled: true,
    })
    const user = userEvent.setup()
    await submitEmail(user)
    expect(post).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Send sign-in code/ }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  })

  it('surfaces a rejected send as an error toast instead of a silent success', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: false,
        message: 'Too many sign-in links requested, please try again later.',
      },
    } as never)

    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    const emailInput = await screen.findByLabelText('Email')
    await user.type(emailInput, 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /Send sign-in code/ }))

    // The code step must never appear for a rejected request.
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Check your email' })
      ).not.toBeInTheDocument()
    )
    expect(
      screen.getByRole('button', { name: /Send sign-in code/ })
    ).toBeEnabled()
  })
})

describe('MagicLinkForm code step', () => {
  function mockMailAndCode(codeResponse: Record<string, unknown>) {
    return vi.spyOn(api, 'post').mockImplementation(((url: string) =>
      Promise.resolve({
        data:
          url === '/api/magic_link/send'
            ? { success: true, resend_after: 45 }
            : codeResponse,
      })) as never)
  }

  it('signs in with the six digits as soon as the last one is typed', async () => {
    const post = mockMailAndCode({ success: false, message: 'x' })
    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    await submitEmail(user)

    await user.type(await screen.findByLabelText('Sign-in code'), '123456')

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/magic_link/code',
        { email: 'someone@example.com', code: '123456' },
        { skipAuthRefresh: true }
      )
    )
  })

  it('shows a wrong code beside the field and lets the customer retype', async () => {
    mockMailAndCode({
      success: false,
      message: 'Code is incorrect or has expired',
    })
    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    await submitEmail(user)

    const input = await screen.findByLabelText('Sign-in code')
    await user.type(input, '000000')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Code is incorrect or has expired'
    )
    expect(input).toHaveValue('')
    await user.type(input, '1')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('returns to the email field for a different address', async () => {
    mockMailAndCode({ success: false })
    renderInRouter(SignInHarness, '/')
    const user = userEvent.setup()
    await submitEmail(user)

    await user.click(
      await screen.findByRole('button', { name: /Use a different email/ })
    )
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
  })
})

describe('SignUp', () => {
  it('offers the same emailed link as sign-in when registration is enabled', async () => {
    renderInRouter(SignUp, '/', {
      magic_link_enabled: true,
      magic_link_register_enabled: true,
    })

    // One mailbox field, no password fields: the link registers and signs in.
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByText('Password')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'We will email you a sign-in code and link. New email addresses create an account automatically.'
      )
    ).toBeInTheDocument()
  })

  it('keeps the password form when the link cannot register', async () => {
    renderInRouter(SignUp, '/', { magic_link_enabled: false })

    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByText(/Send sign-in code/)).not.toBeInTheDocument()
  })
})

describe('EmailLoginConfirm', () => {
  it('exchanges the link token for a session and leaves the landing page', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, data: bundle } } as never)

    renderInRouter(() => <EmailLoginConfirm token='mailed-token' />, '/')

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/magic_link/login',
        { token: 'mailed-token' },
        { skipAuthRefresh: true }
      )
    )
    await waitFor(() =>
      expect(useAuthStore.getState().auth.session?.sid).toBe('magic-session')
    )
  })

  it('never keeps the token in the address bar after claiming it', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, data: bundle },
    } as never)

    window.history.pushState(null, '', '/email-login?token=live-token')
    renderInRouter(() => <EmailLoginConfirm token='live-token' />, '/')

    await waitFor(() =>
      expect(window.location.search).not.toContain('live-token')
    )
  })

  it('keeps signing in after the router drops the token from the address', async () => {
    let respond!: (value: unknown) => void
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        respond = resolve
      }) as never
    )

    const { router } = renderInRouter(LiveSearchHarness, '/?token=live-token')
    expect(await screen.findByText('Signing you in…')).toBeInTheDocument()

    // The browser history reports the URL rewrite to the router; the memory
    // history here does not, so the test makes the same change directly.
    await router.navigate({ to: '/', search: {}, replace: true })
    expect(
      screen.queryByText('This sign-in link is invalid or has expired.')
    ).not.toBeInTheDocument()
    expect(screen.getByText('Signing you in…')).toBeInTheDocument()

    respond({ data: { success: true, data: bundle } })
    expect(await screen.findByText('Dashboard destination')).toBeInTheDocument()
  })

  it('offers a new link when the token was already spent', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: false,
        message:
          'Sign-in link is invalid or has expired, please request a new one',
      },
    } as never)

    renderInRouter(() => <EmailLoginConfirm token='spent-token' />, '/')

    await waitFor(() =>
      expect(
        screen.getByText('This sign-in link is invalid or has expired.')
      ).toBeInTheDocument()
    )
    expect(useAuthStore.getState().auth.session).toBeNull()
    expect(
      screen.getByRole('button', { name: /Request a new link/ })
    ).toBeInTheDocument()
  })

  it('shows the invalid-link state when no token arrived', async () => {
    const post = vi.spyOn(api, 'post')
    renderInRouter(() => <EmailLoginConfirm />, '/')

    await waitFor(() =>
      expect(
        screen.getByText('This sign-in link is invalid or has expired.')
      ).toBeInTheDocument()
    )
    expect(post).not.toHaveBeenCalled()
  })
})
