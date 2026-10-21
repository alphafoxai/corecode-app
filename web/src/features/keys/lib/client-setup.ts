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
 * CoreCode fork: the snippets a customer pastes to point Claude Code at this
 * gateway. They follow the public docs (/docs/#claude-code) word for word, so
 * the console and the docs never give two different answers.
 *
 * Claude Code reads the Anthropic base URL without `/v1`; a trailing `/v1`
 * makes it request `/v1/v1/messages`.
 */

export const CLIENT_SETUP_TARGETS = [
  'settings',
  'shell',
  'powershell',
  'cc-switch',
  'magpie',
] as const

export type ClientSetupTarget = (typeof CLIENT_SETUP_TARGETS)[number]

/** Used when the gateway lists no Claude models for this account. */
export const DEFAULT_CLAUDE_MODELS = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
]

export function getAnthropicBaseUrl(
  serverAddress: string | undefined,
  fallbackOrigin: string
): string {
  const base = serverAddress?.trim() || fallbackOrigin
  return base.replace(/\/+$/, '').replace(/\/v1$/, '')
}

export function pickClaudeModels(models: readonly string[]): string[] {
  const claude = models.filter((model) => model.startsWith('claude-'))
  return claude.length > 0 ? claude : DEFAULT_CLAUDE_MODELS
}

/** Shows enough of a key to recognise it without exposing it on screen. */
export function maskApiKey(key: string): string {
  const full = key.startsWith('sk-') ? key : `sk-${key}`
  if (full.length <= 14) return full
  return `${full.slice(0, 7)}…${full.slice(-4)}`
}

export function getMagpieProviderId(providerName: string): string {
  const slug = providerName
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  return slug || 'corecode'
}

export function buildClientSetupSnippet(
  target: ClientSetupTarget,
  args: {
    baseUrl: string
    apiKey: string
    providerName: string
    models: readonly string[]
  }
): string {
  switch (target) {
    case 'settings':
    case 'cc-switch':
      return JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: args.baseUrl,
            ANTHROPIC_AUTH_TOKEN: args.apiKey,
          },
        },
        null,
        2
      )
    case 'shell':
      return [
        `export ANTHROPIC_BASE_URL=${args.baseUrl}`,
        `export ANTHROPIC_AUTH_TOKEN=${args.apiKey}`,
        'claude',
      ].join('\n')
    case 'powershell':
      return [
        `$env:ANTHROPIC_BASE_URL = "${args.baseUrl}"`,
        `$env:ANTHROPIC_AUTH_TOKEN = "${args.apiKey}"`,
        'claude',
      ].join('\n')
    case 'magpie': {
      const id = getMagpieProviderId(args.providerName)
      const models = pickClaudeModels(args.models)
      return [
        `magpie provider add ${args.providerName} anthropic=${args.baseUrl} key=${args.apiKey} \\`,
        `  models=${models.join(',')}`,
        `magpie provider test ${id}`,
        `magpie claude ${id}/${models[0]}`,
      ].join('\n')
    }
  }
}

/**
 * Deep link that CC Switch registers. The app shows a confirmation with the
 * address before it imports anything.
 */
export function buildCCSwitchURL(args: {
  app: string
  name: string
  serverAddress: string
  apiKey: string
  models: Record<string, string>
}): string {
  const endpoint =
    args.app === 'codex' ? `${args.serverAddress}/v1` : args.serverAddress
  const params = new URLSearchParams()
  params.set('resource', 'provider')
  params.set('app', args.app)
  params.set('name', args.name)
  params.set('endpoint', endpoint)
  params.set('apiKey', args.apiKey)
  for (const [k, v] of Object.entries(args.models)) {
    if (v) params.set(k, v)
  }
  params.set('homepage', args.serverAddress)
  params.set('enabled', 'true')
  return `ccswitch://v1/import?${params.toString()}`
}
