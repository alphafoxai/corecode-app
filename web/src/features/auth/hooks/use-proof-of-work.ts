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
import i18next from 'i18next'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { useStatus } from '@/hooks/use-status'

import { requestPowChallenge } from '../api'
import { solvePowChallenge } from '../lib/proof-of-work'

// A solution this close to its expiry is solved again rather than sent.
const EXPIRY_MARGIN_MS = 30_000

type Solved = { solution: string; expiresAt: number }

async function solveNext(signal?: AbortSignal): Promise<Solved> {
  const challenge = await requestPowChallenge()
  const solution = await solvePowChallenge(challenge, signal)
  return { solution, expiresAt: challenge.expires_at * 1000 }
}

/**
 * Solves a proof-of-work challenge in the background while the check is on,
 * so a form usually has its solution ready before the customer submits.
 * takeProof() hands each solution out once, then starts the next one.
 * It resolves to undefined while the check is off, and to null when no
 * solution could be made; the customer has then already been told.
 */
export function useProofOfWork() {
  const { status } = useStatus()
  const enabled = Boolean(status?.pow_check)
  const next = useRef<{
    promise: Promise<Solved>
    abort: AbortController
  } | null>(null)
  // Background solving stops with the form, including one a take would start.
  const mounted = useRef(false)

  const prepare = useCallback(() => {
    if (!mounted.current) return
    const abort = new AbortController()
    const promise = solveNext(abort.signal)
    // A failure surfaces when takeProof awaits it.
    promise.catch(() => undefined)
    next.current = { promise, abort }
  }, [])

  useEffect(() => {
    if (!enabled) return
    mounted.current = true
    if (!next.current) prepare()
    return () => {
      mounted.current = false
      next.current?.abort.abort()
      next.current = null
    }
  }, [enabled, prepare])

  const takeProof = useCallback(async (): Promise<
    string | undefined | null
  > => {
    if (!enabled) return undefined
    const pending = next.current
    next.current = null
    try {
      let solved = pending ? await pending.promise.catch(() => null) : null
      if (!solved || solved.expiresAt - Date.now() < EXPIRY_MARGIN_MS) {
        solved = await solveNext()
      }
      return solved.solution
    } catch {
      toast.error(
        i18next.t(
          'Browser check could not finish, please refresh the page and try again'
        )
      )
      return null
    } finally {
      prepare()
    }
  }, [enabled, prepare])

  return { takeProof }
}
