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
import { useEffect } from 'react'
import { useForm, type Path } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsControlChildren,
  SettingsControlGroup,
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

// The server also validates rule formats and compiles expressions.
const riskGateSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['observe', 'enforce']),
  distill_enabled: z.boolean(),
  distill_rules: z.string(),
  distill_strike: z.boolean(),
  hard_regex_enabled: z.boolean(),
  hard_regex_rules: z.string(),
  hard_regex_strike: z.boolean(),
  similarity_enabled: z.boolean(),
  similarity_threshold: z.number().gt(0).max(1),
  decision_enabled: z.boolean(),
  decision_base_url: z.union([z.literal(''), z.url()]),
  decision_api_key: z.string(),
  decision_model: z.string(),
  decision_questions: z.string(),
  decision_threshold: z.number().gt(0).max(1),
  decision_timeout_ms: z.number().int().min(200).max(30000),
  decision_fail_open: z.boolean(),
  decision_strike: z.boolean(),
  decision_skip_official: z.boolean(),
})

type RiskGateFormValues = z.output<typeof riskGateSchema>
type RiskGateField = keyof RiskGateFormValues

export type RiskGateValues = {
  [K in RiskGateField as `risk_gate_setting.${K}`]: RiskGateFormValues[K]
}

const FIELDS = Object.keys(riskGateSchema.shape) as RiskGateField[]

const toFormValues = (defaults: RiskGateValues): RiskGateFormValues =>
  Object.fromEntries(
    FIELDS.map((field) => [field, defaults[`risk_gate_setting.${field}`]])
  ) as RiskGateFormValues

type RiskGateFormProps = {
  defaultValues: RiskGateValues
}

export function RiskGateForm(props: RiskGateFormProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<RiskGateFormValues, unknown, RiskGateFormValues>({
    resolver: zodResolver(riskGateSchema),
    mode: 'onChange',
    defaultValues: toFormValues(props.defaultValues),
  })

  useEffect(() => {
    form.reset(toFormValues(props.defaultValues))
  }, [props.defaultValues, form])

  const onSubmit = async (values: RiskGateFormValues) => {
    for (const field of FIELDS) {
      const key = `risk_gate_setting.${field}` as const
      const value = values[field]
      // The saved key is never sent to the browser; empty keeps it.
      if (field === 'decision_api_key' && value === '') continue
      if (value !== props.defaultValues[key]) {
        await updateOption.mutateAsync({ key, value })
      }
    }
    form.setValue('decision_api_key', '')
  }

  const switchField = (
    name: Path<RiskGateFormValues>,
    label: string,
    description: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <SettingsSwitchItem>
          <SettingsSwitchContent>
            <FormLabel>{label}</FormLabel>
            <FormDescription>{description}</FormDescription>
          </SettingsSwitchContent>
          <FormControl>
            <Switch
              checked={field.value === true}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </SettingsSwitchItem>
      )}
    />
  )

  const textField = (
    name: Path<RiskGateFormValues>,
    label: string,
    description: string,
    options?: { multiline?: boolean; secret?: boolean; placeholder?: string }
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {options?.multiline ? (
              <Textarea
                rows={6}
                className='font-mono text-xs'
                placeholder={options.placeholder}
                {...field}
                value={String(field.value)}
              />
            ) : (
              <Input
                type={options?.secret ? 'password' : 'text'}
                autoComplete='off'
                placeholder={options?.placeholder}
                {...field}
                value={String(field.value)}
              />
            )}
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const numberField = (
    name: Path<RiskGateFormValues>,
    label: string,
    description: string,
    step: number
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type='number' step={step} {...safeNumberFieldProps(field)} />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const rulePlaceholder = t('name | regular expression, one per line')

  return (
    <Form {...form}>
      <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
        <SettingsPageFormActions
          onSave={form.handleSubmit(onSubmit)}
          isSaving={updateOption.isPending}
          saveLabel='Save risk audit settings'
        />
        {switchField(
          'enabled',
          t('Enable the risk gate'),
          t(
            'Check every relay request before billing and channel selection: distillation, hard regex, refusal cache, then the decision model. A blocked request costs the customer nothing and never reaches the pool.'
          )
        )}
        <FormField
          control={form.control}
          name='mode'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Mode')}</FormLabel>
              <Select
                items={[
                  { value: 'observe', label: t('Observe - record only') },
                  { value: 'enforce', label: t('Enforce - block requests') },
                ]}
                value={field.value}
                onValueChange={field.onChange}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='observe'>
                      {t('Observe - record only')}
                    </SelectItem>
                    <SelectItem value='enforce'>
                      {t('Enforce - block requests')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {t(
                  'Observe mode records what each stage would block and lets every request through. Suspensions and refused conversations follow the violation guard mode.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <SettingsControlGroup>
          {switchField(
            'distill_enabled',
            t('1 · Distillation'),
            t(
              'Checks the system prompt and latest user message against the configured distillation rules.'
            )
          )}
          <SettingsControlChildren className='space-y-4'>
            {textField(
              'distill_rules',
              t('Distillation rules'),
              t(
                'Paste a vm2api distill-rules.json object to use its exemptions, fingerprints and structure checks, or enter legacy name | regular expression lines. Legacy lines starting with # are ignored; add (?i) to ignore case. Optional JSON flags: zero_inject (default false), openai_platform_enabled (default false), detect_proxied_official_cc (default true).'
              ),
              {
                multiline: true,
                placeholder: t(
                  'vm2api distill-rules.json or name | regular expression, one per line'
                ),
              }
            )}
            {switchField(
              'distill_strike',
              t('Record a violation'),
              t(
                'A hit counts as a violation against the customer under the violation guard policy.'
              )
            )}
          </SettingsControlChildren>
        </SettingsControlGroup>

        <SettingsControlGroup>
          {switchField(
            'hard_regex_enabled',
            t('2 · Hard regex'),
            t(
              'Matches every message the customer wrote. Tool results, system prompts and system reminders are not scanned.'
            )
          )}
          <SettingsControlChildren className='space-y-4'>
            {textField(
              'hard_regex_rules',
              t('Hard regex rules'),
              t(
                'One rule per line as name | regular expression. Lines starting with # are ignored. With structured JSON distillation, matching ignores case and uses JavaScript-compatible syntax, including lookbehind. With legacy distillation lines, Go regular expressions apply; add (?i) to ignore case.'
              ),
              { multiline: true, placeholder: rulePlaceholder }
            )}
            {switchField(
              'hard_regex_strike',
              t('Record a violation'),
              t(
                'A hit counts as a violation against the customer under the violation guard policy.'
              )
            )}
          </SettingsControlChildren>
        </SettingsControlGroup>

        <SettingsControlGroup>
          {switchField(
            'similarity_enabled',
            t('3 · Refusal cache: similar messages'),
            t(
              'Blocks a latest message that closely resembles one the upstream refused, from any customer. Suspended accounts and refused conversations are always checked while the violation guard is on.'
            )
          )}
          <SettingsControlChildren>
            {numberField(
              'similarity_threshold',
              t('Similarity threshold'),
              t(
                'Between 0 and 1. Messages under 32 characters are never compared.'
              ),
              0.01
            )}
          </SettingsControlChildren>
        </SettingsControlGroup>

        <SettingsControlGroup>
          {switchField(
            'decision_enabled',
            t('4 · Decision model'),
            t(
              "Asks a Jev Decisions model about the customer's own messages. Repeated text reuses the verdict for an hour."
            )
          )}
          <SettingsControlChildren className='grid gap-4 lg:grid-cols-2'>
            {textField(
              'decision_base_url',
              t('Decision model address'),
              t(
                'The host serving POST /v1/systemone: Jev itself (https://api.typesafe.ai/v1) or the engine.'
              ),
              { placeholder: 'https://api.typesafe.ai/v1' }
            )}
            {textField(
              'decision_api_key',
              t('Decision model key'),
              t('Leave empty to keep the saved key.'),
              { secret: true }
            )}
            {textField(
              'decision_model',
              t('Decision model'),
              t('Leave empty to use the endpoint default.')
            )}
            {numberField(
              'decision_threshold',
              t('Block threshold'),
              t(
                'Blocks when the probability of a yes answer to any question reaches this value.'
              ),
              0.01
            )}
            {numberField(
              'decision_timeout_ms',
              t('Timeout (ms)'),
              t('Between 200 and 30000.'),
              100
            )}
            <div className='lg:col-span-2'>
              {textField(
                'decision_questions',
                t('Questions'),
                t(
                  'One question per line, written as id | question. A yes means the request should be blocked. At most 16.'
                ),
                { multiline: true }
              )}
            </div>
            <div className='space-y-4 lg:col-span-2'>
              {switchField(
                'decision_fail_open',
                t('Let requests through when the model fails'),
                t(
                  'When off, a request the model cannot judge is blocked, without a violation.'
                )
              )}
              {switchField(
                'decision_strike',
                t('Record a violation'),
                t(
                  'A hit counts as a violation against the customer under the violation guard policy.'
                )
              )}
              {switchField(
                'decision_skip_official',
                t('Skip recognized Claude Code clients'),
                t(
                  'A request from official Claude Code is not sent to the model unless its customer had a refused conversation in the violation window. A client can imitate Claude Code to skip it.'
                )
              )}
            </div>
          </SettingsControlChildren>
        </SettingsControlGroup>
      </SettingsForm>
    </Form>
  )
}
