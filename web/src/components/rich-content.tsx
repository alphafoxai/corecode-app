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
import { lazy, Suspense } from 'react'

import type { HtmlContentVariant } from '@/components/html-content'

// The header's notification popover renders this on every console page, so the
// renderers (KaTeX, marked, DOMPurify) load when content is first shown rather
// than with the layout.
const HtmlContent = lazy(() =>
  import('@/components/html-content').then((m) => ({ default: m.HtmlContent }))
)
const Markdown = lazy(() =>
  import('@/components/ui/markdown').then((m) => ({ default: m.Markdown }))
)

type RichContentMode = 'markdown' | 'html'

interface RichContentProps {
  content: string
  mode?: RichContentMode
  breaks?: boolean
  className?: string
  htmlVariant?: HtmlContentVariant
}

export function RichContent(props: RichContentProps) {
  return (
    <Suspense fallback={null}>
      {props.mode === 'html' ? (
        <HtmlContent
          content={props.content}
          className={props.className}
          variant={props.htmlVariant}
        />
      ) : (
        <Markdown breaks={props.breaks} className={props.className}>
          {props.content}
        </Markdown>
      )}
    </Suspense>
  )
}
