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
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Explains a costly cache miss on hover and focus. A miss that did not
 * stream gets the auto mode explanation; see isNonStreamCacheMiss.
 */
export function CacheMissTooltip(props: {
  isStream: boolean
  render: ReactElement
}) {
  const { t } = useTranslation()

  return (
    <Tooltip>
      <TooltipTrigger render={props.render} />
      <TooltipContent>
        {props.isStream
          ? t(
              'Long context, almost no cache hit: billed as a fresh cache write'
            )
          : t(
              'Did not stream, long context, almost no cache hit. Likely a Claude Code auto mode check: before a tool call, it sends the conversation to the model, and little of that is cached.'
            )}
      </TooltipContent>
    </Tooltip>
  )
}
