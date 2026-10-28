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
import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import { apiKeySchema, type ApiKey } from '../../types'
import {
  getApiKeyFormDefaultValues,
  getApiKeyFormSchema,
  transformApiKeyToFormDefaults,
  transformFormDataToPayload,
} from '../api-key-form'

const t = ((key: string) => key) as TFunction

const baseApiKey: ApiKey = {
  id: 1,
  name: 'test',
  key: 'sk-test',
  status: 1,
  remain_quota: 0,
  used_quota: 0,
  unlimited_quota: true,
  expired_time: -1,
  created_time: 1,
  accessed_time: 0,
  group: 'auto',
  auto_groups: null,
  cross_group_retry: true,
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
  allow_user_quota_query: false,
}

describe('API key Auto group form mapping', () => {
  test('treats legacy token responses without auto_groups as inheritance', () => {
    const legacyApiKey: Record<string, unknown> = { ...baseApiKey }
    delete legacyApiKey.auto_groups

    expect(apiKeySchema.parse(legacyApiKey).auto_groups).toBe(null)
  })

  test('creates an Auto token that follows the global order', () => {
    const defaults = getApiKeyFormDefaultValues(true)

    expect(defaults.group).toBe('auto')
    expect(transformFormDataToPayload(defaults).auto_groups).toEqual([])
  })

  test('clears an order stored before it was fixed when the key is saved', () => {
    const defaults = transformApiKeyToFormDefaults({
      ...baseApiKey,
      auto_groups: ['vip', 'default'],
    })

    expect(getApiKeyFormSchema(t).safeParse(defaults).success).toBe(true)
    expect(transformFormDataToPayload(defaults).auto_groups).toEqual([])
  })

  test('submits an empty array and no retry for non-Auto groups', () => {
    const nonAuto = { ...getApiKeyFormDefaultValues(true), group: 'default' }

    expect(transformFormDataToPayload(nonAuto).auto_groups).toEqual([])
    expect(transformFormDataToPayload(nonAuto).cross_group_retry).toBe(false)
  })
})

describe('API key user quota query form mapping', () => {
  test('lets a new key query the user quota by default', () => {
    for (const defaultUseAutoGroup of [true, false]) {
      const defaults = getApiKeyFormDefaultValues(defaultUseAutoGroup)

      expect(defaults.allow_user_quota_query).toBe(true)
      expect(transformFormDataToPayload(defaults).allow_user_quota_query).toBe(
        true
      )
    }
  })

  test.each([true, false])(
    'keeps the stored value %s when an existing key is edited and saved',
    (stored) => {
      const defaults = transformApiKeyToFormDefaults({
        ...baseApiKey,
        allow_user_quota_query: stored,
      })

      expect(defaults.allow_user_quota_query).toBe(stored)
      expect(transformFormDataToPayload(defaults).allow_user_quota_query).toBe(
        stored
      )
    }
  )
})
