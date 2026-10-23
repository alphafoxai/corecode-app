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
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { requestMagicLink } from '@/features/auth/api'
import { LegalConsent } from '@/features/auth/components/legal-consent'
import { OAuthProviders } from '@/features/auth/components/oauth-providers'
import {
  forgotPasswordFormSchema,
  MAGIC_LINK_COUNTDOWN,
} from '@/features/auth/constants'
import { useCountdown } from '@/hooks/use-countdown'
import { useStatus } from '@/hooks/use-status'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

type MagicLinkFormProps = {
  className?: string
  redirectTo?: string
  registrationEnabled?: boolean
  // OAuth sits beside the link, not behind "another way": both can open an
  // account, so a new customer sees every way in at once.
  showOAuthProviders?: boolean
}

// One field signs customers in and registers them: an unknown address creates
// the account when the operator allows registration.
export function MagicLinkForm({
  className,
  redirectTo,
  registrationEnabled = true,
  showOAuthProviders = false,
}: MagicLinkFormProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [agreedToLegal, setAgreedToLegal] = useState(false)

  const { status } = useStatus()
  const requiresLegalConsent = Boolean(
    status?.user_agreement_enabled || status?.privacy_policy_enabled
  )
  const legalConsentErrorMessage = t('Please agree to the legal terms first')

  useEffect(() => {
    setAgreedToLegal(!requiresLegalConsent)
  }, [requiresLegalConsent])

  const {
    secondsLeft,
    isActive,
    start: startCountdown,
  } = useCountdown({ initialSeconds: MAGIC_LINK_COUNTDOWN })

  const form = useForm<z.infer<typeof forgotPasswordFormSchema>>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(data: z.infer<typeof forgotPasswordFormSchema>) {
    // A link that can open an account is a registration entry, so the same
    // consent gate as the password form applies before the send is spent.
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }

    setIsLoading(true)
    try {
      const res = await requestMagicLink(data.email, redirectTo)
      if (res?.success) {
        setSentTo(data.email)
        startCountdown(res.resend_after)
        toast.success(t('Sign-in link sent, please check your inbox'))
      } else {
        handleServerError(
          createServerError(res, t('Failed to send sign-in link'))
        )
      }
    } catch (error: unknown) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to send sign-in link'))
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
      >
        {showOAuthProviders && (
          <OAuthProviders
            status={status}
            redirectTo={redirectTo}
            disabled={isLoading || (requiresLegalConsent && !agreedToLegal)}
            separatorLabel={t('Or continue with email')}
          />
        )}

        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Email')}</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  autoComplete='email'
                  className='h-10'
                  placeholder='name@example.com'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {registrationEnabled
                  ? t(
                      'We will email you a sign-in link. New email addresses create an account automatically.'
                    )
                  : t('We will email you a one-time sign-in link.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {sentTo && (
          <Alert>
            <AlertDescription>
              {t(
                'A sign-in link was sent to {{email}}. It works once and expires in 10 minutes.',
                {
                  email: sentTo,
                }
              )}
            </AlertDescription>
          </Alert>
        )}

        <LegalConsent
          status={status}
          checked={agreedToLegal}
          onCheckedChange={setAgreedToLegal}
        />

        <Button
          type='submit'
          size='lg'
          className='h-10'
          disabled={isLoading || isActive}
        >
          {isLoading && <Loader2 className='animate-spin' />}
          {isActive
            ? t('Resend link ({{seconds}}s)', { seconds: secondsLeft })
            : t('Send sign-in link')}
          {!isLoading && <ArrowRight />}
        </Button>
      </form>
    </Form>
  )
}
