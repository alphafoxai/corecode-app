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
import { CircleCheck, MessageCircle, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { EnterpriseApplicationForm } from './components/enterprise-application-form'
import {
  ENTERPRISE_TELEGRAM_HANDLE,
  ENTERPRISE_TELEGRAM_URL,
} from './constants'

export function Enterprise() {
  const { t } = useTranslation()
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)

  const steps = [
    {
      title: t('Tell us about your usage'),
      description: t('Your monthly spend and the models you rely on.'),
    },
    {
      title: t('We get in touch'),
      description: t('Someone from our team replies by email or Telegram.'),
    },
    {
      title: t('Receive your quote'),
      description: t('Pricing sized to your volume, applied to your account.'),
    },
  ]

  return (
    <PublicLayout>
      <div className='mx-auto flex max-w-5xl flex-col gap-10 py-8 sm:py-12'>
        <header className='flex flex-col gap-3 text-center'>
          <h1 className='text-3xl font-semibold tracking-tight text-balance sm:text-4xl'>
            {t('Enterprise pricing')}
          </h1>
          <p className='text-muted-foreground mx-auto max-w-2xl text-pretty'>
            {t(
              'Teams with steady, high-volume usage can apply for a dedicated discount. Message us on Telegram or leave your details below, and we will send you a quote.'
            )}
          </p>
        </header>

        <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]'>
          <div className='flex flex-col gap-6'>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <MessageCircle className='size-5' aria-hidden='true' />
                  {t('Talk to us directly')}
                </CardTitle>
                <CardDescription>
                  {t('The fastest way to discuss pricing for your team.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className='w-full'
                  render={
                    <a
                      href={ENTERPRISE_TELEGRAM_URL}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
                  }
                >
                  <Send aria-hidden='true' />
                  {t('Message @{{handle}} on Telegram', {
                    handle: ENTERPRISE_TELEGRAM_HANDLE,
                  })}
                </Button>
              </CardContent>
            </Card>

            <section aria-labelledby='enterprise-steps' className='px-1'>
              <h2 id='enterprise-steps' className='mb-4 text-sm font-medium'>
                {t('How it works')}
              </h2>
              <ol className='flex flex-col gap-4'>
                {steps.map((step, index) => (
                  <li key={step.title} className='flex gap-3'>
                    <span className='bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums'>
                      {index + 1}
                    </span>
                    <div className='flex flex-col gap-0.5'>
                      <span className='text-sm font-medium'>{step.title}</span>
                      <span className='text-muted-foreground text-sm'>
                        {step.description}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('Apply for enterprise pricing')}</CardTitle>
              <CardDescription>
                {t('No account needed. Fields marked * are required.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submittedEmail === null ? (
                <EnterpriseApplicationForm onSubmitted={setSubmittedEmail} />
              ) : (
                <div
                  role='status'
                  className='flex flex-col items-center gap-3 py-10 text-center'
                >
                  <CircleCheck
                    className='size-10 text-emerald-600 dark:text-emerald-400'
                    aria-hidden='true'
                  />
                  <p className='font-medium'>{t('Application received')}</p>
                  <p className='text-muted-foreground max-w-sm text-sm'>
                    {t('We will reach you at {{email}} with your quote.', {
                      email: submittedEmail,
                    })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicLayout>
  )
}
