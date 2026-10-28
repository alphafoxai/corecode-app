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
 * CoreCode fork: one place that tells a customer how to point Claude Code at
 * this gateway, with their own key filled in.
 *
 * The snippet on screen shows a masked key; the copy button fetches the real
 * key and copies the snippet with it. That is why this does not use
 * `CodeBlockCopyButton` or `CopyButton`: both copy the text they display.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightLeft,
  Check,
  Copy,
  KeyRound,
  Loader2,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { getUserModels } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { fetchTokenKey } from '../api'
import {
  buildCCSwitchURL,
  buildClientSetupSnippet,
  buildMagpieImportURL,
  CLIENT_SETUP_TARGETS,
  getAnthropicBaseUrl,
  maskApiKey,
  pickClaudeModels,
  type ClientSetupTarget,
} from '../lib/client-setup'
import type { ApiKey } from '../types'

const TARGET_LABELS: Record<ClientSetupTarget, string> = {
  settings: 'settings.json',
  shell: 'macOS / Linux',
  powershell: 'Windows',
  'cc-switch': 'CC Switch',
  magpie: 'Magpie',
}

/** What the snippet is: a file to edit or the shell to paste it into. */
const TARGET_SOURCES: Record<ClientSetupTarget, string> = {
  settings: '~/.claude/settings.json',
  shell: 'bash / zsh',
  powershell: 'PowerShell',
  'cc-switch': 'CC Switch · settings.json',
  magpie: 'bash / zsh',
}

function getTargetHint(
  target: ClientSetupTarget,
  t: (key: string) => string
): string {
  switch (target) {
    case 'settings':
      return t(
        'Recommended. Merge this env block into ~/.claude/settings.json (Windows: %USERPROFILE%\\.claude\\settings.json), then open a new terminal and run claude.'
      )
    case 'shell':
      return t(
        'For the current terminal only. Add the two export lines to ~/.zshrc or ~/.bashrc to keep them.'
      )
    case 'powershell':
      return t(
        'For the current PowerShell window only. Use setx for both variables to keep them, then reopen the terminal.'
      )
    case 'cc-switch':
      return t(
        'Import with one click, or add a custom provider in CC Switch and paste this config. New Claude Code sessions use it after you switch.'
      )
    case 'magpie':
      return t(
        'Adds this gateway as a Magpie provider and switches Claude Code to it. New sessions use it.'
      )
  }
}

interface ClientSetupGuideProps {
  /** Keys the customer can pick from; the first enabled one is preselected. */
  keys: ApiKey[]
  keysLoading?: boolean
  className?: string
}

export function ClientSetupGuide(props: ClientSetupGuideProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { status } = useStatus()
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const [target, setTarget] = useState<ClientSetupTarget>('settings')
  const [pickedKeyId, setPickedKeyId] = useState<number | null>(null)
  const [busy, setBusy] = useState<
    'copy' | 'verify' | 'cc-switch' | 'magpie' | null
  >(null)
  const [copied, setCopied] = useState<'copy' | 'verify' | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['client-setup', 'user-models'],
    queryFn: async () => {
      const result = requireServerSuccess(await getUserModels())
      return result.data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const usableKeys = props.keys.filter((key) => key.status === 1)
  const selectedKey =
    usableKeys.find((key) => key.id === pickedKeyId) ?? usableKeys[0] ?? null
  const providerName = status?.system_name?.trim() || 'CoreCode'
  const baseUrl = getAnthropicBaseUrl(
    typeof status?.server_address === 'string'
      ? status.server_address
      : undefined,
    window.location.origin
  )
  const models = pickClaudeModels(modelsQuery.data ?? [])
  const placeholderKey = t('sk-your-key')
  const snippet = buildClientSetupSnippet(target, {
    baseUrl,
    apiKey: selectedKey ? maskApiKey(selectedKey.key) : placeholderKey,
    providerName,
    models,
  })
  const verifyCommand = `claude -p "${t('Reply with ok')}"`

  const resolveKey = async (): Promise<string | null> => {
    if (!selectedKey) return null
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['client-setup', 'secret', selectedKey.id],
        queryFn: () => fetchTokenKey(selectedKey.id),
        staleTime: Infinity,
        gcTime: 5 * 60 * 1000,
      })
      if (result.success && result.data?.key) return `sk-${result.data.key}`
      handleServerError(result, t('Failed to copy to clipboard'))
    } catch (error) {
      handleServerError(error, t('Failed to copy to clipboard'))
    }
    return null
  }

  const flashCopied = (which: 'copy' | 'verify') => {
    setCopied(which)
    window.setTimeout(() => setCopied(null), 1800)
  }

  const handleCopySnippet = async () => {
    setBusy('copy')
    try {
      const apiKey = selectedKey ? await resolveKey() : placeholderKey
      if (!apiKey) return
      const text = buildClientSetupSnippet(target, {
        baseUrl,
        apiKey,
        providerName,
        models,
      })
      if (await copyToClipboard(text)) {
        flashCopied('copy')
        toast.success(
          selectedKey
            ? t('Copied with your full API key')
            : t('Copied to clipboard')
        )
      } else {
        toast.error(t('Failed to copy to clipboard'))
      }
    } finally {
      setBusy(null)
    }
  }

  const handleCopyVerify = async () => {
    if (await copyToClipboard(verifyCommand)) flashCopied('verify')
  }

  const handleOpenCCSwitch = async () => {
    setBusy('cc-switch')
    try {
      const apiKey = await resolveKey()
      if (!apiKey) return
      window.open(
        buildCCSwitchURL({
          app: 'claude',
          name: providerName,
          serverAddress: baseUrl,
          apiKey,
          models: { model: models[0] },
        }),
        '_blank'
      )
    } finally {
      setBusy(null)
    }
  }

  const handleOpenMagpie = async () => {
    setBusy('magpie')
    try {
      const apiKey = await resolveKey()
      if (!apiKey) return
      window.open(
        buildMagpieImportURL({ baseUrl, apiKey, providerName, models }),
        '_blank',
        'noopener'
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', props.className)}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Tabs
          value={target}
          onValueChange={(value) => setTarget(value as ClientSetupTarget)}
          className='max-w-full min-w-0'
        >
          <TabsList
            aria-label={t('Client')}
            className='no-scrollbar max-w-full justify-start overflow-x-auto'
          >
            {CLIENT_SETUP_TARGETS.map((item) => (
              <TabsTrigger key={item} value={item} className='flex-none px-2.5'>
                {TARGET_LABELS[item]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {usableKeys.length > 1 && selectedKey && (
          <Select
            value={String(selectedKey.id)}
            onValueChange={(value) => setPickedKeyId(Number(value))}
          >
            <SelectTrigger size='sm' aria-label={t('API key')} className='w-44'>
              <SelectValue>
                <KeyRound className='text-muted-foreground' aria-hidden />
                <span className='truncate'>{selectedKey.name}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {usableKeys.map((key) => (
                  <SelectItem key={key.id} value={String(key.id)}>
                    {key.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      <p className='text-muted-foreground text-xs leading-relaxed text-pretty'>
        {getTargetHint(target, t)}
      </p>

      <div className='bg-muted/40 min-w-0 overflow-hidden rounded-xl border'>
        <div className='flex items-center justify-between gap-2 border-b py-1.5 pr-1.5 pl-4'>
          <span className='text-muted-foreground truncate font-mono text-xs'>
            {TARGET_SOURCES[target]}
          </span>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleCopySnippet}
            disabled={busy === 'copy' || props.keysLoading}
          >
            {busy === 'copy' && (
              <Loader2 className='animate-spin' data-icon='inline-start' />
            )}
            {busy !== 'copy' && copied === 'copy' && (
              <Check className='text-success' data-icon='inline-start' />
            )}
            {busy !== 'copy' && copied !== 'copy' && (
              <Copy data-icon='inline-start' />
            )}
            {t('Copy')}
          </Button>
        </div>
        <pre
          className='overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed'
          aria-label={t('Configuration snippet')}
        >
          <code>{snippet}</code>
        </pre>
      </div>

      {target === 'cc-switch' && selectedKey && (
        <Button
          className='self-start'
          size='sm'
          onClick={handleOpenCCSwitch}
          disabled={busy === 'cc-switch'}
        >
          {busy === 'cc-switch' ? (
            <Loader2 className='animate-spin' data-icon='inline-start' />
          ) : (
            <ArrowRightLeft data-icon='inline-start' />
          )}
          {t('Import to CC Switch')}
        </Button>
      )}

      {target === 'magpie' && selectedKey && (
        <Button
          className='self-start'
          size='sm'
          onClick={handleOpenMagpie}
          disabled={busy === 'magpie'}
        >
          {busy === 'magpie' ? (
            <Loader2 className='animate-spin' data-icon='inline-start' />
          ) : (
            <ArrowRightLeft data-icon='inline-start' />
          )}
          {t('Add to Magpie')}
        </Button>
      )}

      {!selectedKey && !props.keysLoading && (
        <div className='bg-primary/5 border-primary/20 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3'>
          <p className='text-sm'>
            {t('Create an API key and it fills in here automatically.')}
          </p>
          <Button size='sm' render={<Link to='/keys' />}>
            <KeyRound data-icon='inline-start' />
            {t('Create API Key')}
          </Button>
        </div>
      )}

      <div className='flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 items-center gap-2 text-xs'>
          <span className='text-muted-foreground shrink-0'>
            {t('Check the connection')}
          </span>
          <Button
            variant='ghost'
            size='xs'
            onClick={handleCopyVerify}
            className='min-w-0 font-mono'
            aria-label={`${t('Copy')}: ${verifyCommand}`}
          >
            <span className='truncate'>{verifyCommand}</span>
            {copied === 'verify' ? (
              <Check className='text-success' data-icon='inline-end' />
            ) : (
              <Copy className='text-muted-foreground' data-icon='inline-end' />
            )}
          </Button>
        </div>
        <p className='text-muted-foreground flex items-start gap-1.5 text-xs'>
          <TriangleAlert
            className='text-warning mt-px size-3.5 shrink-0'
            aria-hidden
          />
          {t(
            'Unset ANTHROPIC_API_KEY and run /logout first if you signed in to claude.ai.'
          )}
        </p>
      </div>
    </div>
  )
}
