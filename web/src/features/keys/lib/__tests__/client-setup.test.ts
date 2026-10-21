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
import { describe, expect, test } from 'vitest'

import {
  buildClientSetupSnippet,
  DEFAULT_CLAUDE_MODELS,
  getAnthropicBaseUrl,
  getMagpieProviderId,
  maskApiKey,
  pickClaudeModels,
} from '../client-setup'

const args = {
  baseUrl: 'https://corecode.live',
  apiKey: 'sk-full-secret-key',
  providerName: 'CoreCode',
  models: ['claude-opus-5-5', 'claude-sonnet-5-5'],
}

describe('getAnthropicBaseUrl', () => {
  test.each([
    ['https://corecode.live', 'https://corecode.live'],
    ['https://corecode.live/', 'https://corecode.live'],
    ['https://corecode.live/v1', 'https://corecode.live'],
    ['https://corecode.live/v1/', 'https://corecode.live'],
    ['  https://corecode.live  ', 'https://corecode.live'],
  ])('reduces %j to the root address Claude Code expects', (input, expected) => {
    expect(getAnthropicBaseUrl(input, 'https://origin.test')).toBe(expected)
  })

  test('falls back to the page origin when no server address is set', () => {
    expect(getAnthropicBaseUrl('', 'https://origin.test')).toBe(
      'https://origin.test'
    )
    expect(getAnthropicBaseUrl(undefined, 'https://origin.test/')).toBe(
      'https://origin.test'
    )
  })
})

describe('buildClientSetupSnippet', () => {
  test('settings.json carries both variables inside env', () => {
    expect(JSON.parse(buildClientSetupSnippet('settings', args))).toEqual({
      env: {
        ANTHROPIC_BASE_URL: 'https://corecode.live',
        ANTHROPIC_AUTH_TOKEN: 'sk-full-secret-key',
      },
    })
  })

  test('the shell snippet exports both variables before starting claude', () => {
    expect(buildClientSetupSnippet('shell', args).split('\n')).toEqual([
      'export ANTHROPIC_BASE_URL=https://corecode.live',
      'export ANTHROPIC_AUTH_TOKEN=sk-full-secret-key',
      'claude',
    ])
  })

  test('the PowerShell snippet quotes both values', () => {
    expect(buildClientSetupSnippet('powershell', args)).toContain(
      '$env:ANTHROPIC_AUTH_TOKEN = "sk-full-secret-key"'
    )
  })

  test('the Magpie snippet adds the provider and switches Claude Code to its first model', () => {
    expect(buildClientSetupSnippet('magpie', args).split('\n')).toEqual([
      'magpie provider add CoreCode anthropic=https://corecode.live key=sk-full-secret-key \\',
      '  models=claude-opus-5-5,claude-sonnet-5-5',
      'magpie provider test corecode',
      'magpie claude corecode/claude-opus-5-5',
    ])
  })
})

describe('pickClaudeModels', () => {
  test('keeps only Claude models from the account list', () => {
    expect(pickClaudeModels(['gpt-4o', 'claude-haiku-5-5'])).toEqual([
      'claude-haiku-5-5',
    ])
  })

  test('falls back to the documented models when the account lists none', () => {
    expect(pickClaudeModels(['gpt-4o'])).toEqual(DEFAULT_CLAUDE_MODELS)
    expect(pickClaudeModels([])).toEqual(DEFAULT_CLAUDE_MODELS)
  })
})

describe('maskApiKey', () => {
  test('shows the prefix and last four characters only', () => {
    expect(maskApiKey('abcdefghijklmnopqrstuvwxyz')).toBe('sk-abcd…wxyz')
    expect(maskApiKey('sk-abcdefghijklmnopqrstuvwxyz')).toBe('sk-abcd…wxyz')
  })
})

describe('getMagpieProviderId', () => {
  test('lowercases the provider name into a slug', () => {
    expect(getMagpieProviderId('CoreCode')).toBe('corecode')
    expect(getMagpieProviderId('My Relay 2')).toBe('my-relay-2')
    expect(getMagpieProviderId('中文')).toBe('corecode')
  })
})
