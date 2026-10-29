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
 * The API requests index.html sends before the bundle has loaded.
 *
 * The status, the setup check and the auth refresh used to start only once the
 * entry bundle had downloaded and run, one round trip after it. An inline
 * script in index.html sends them as the page starts parsing, and the code
 * that would make each request takes the response from here instead.
 *
 * Each response is taken once, by the page load's first caller. A boot request
 * that failed to reach the server (status 0) is not used, so the caller sends
 * its own request as before.
 */
export interface BootResponse {
  status: number
  data?: unknown
}

type BootRequestName = 'status' | 'setup' | 'refresh'

declare global {
  interface Window {
    __bootRequests?: Partial<Record<BootRequestName, Promise<BootResponse>>>
  }
}

/** The boot request's response if one was sent and not yet taken. */
export async function takeBootRequest(
  name: BootRequestName
): Promise<BootResponse | null> {
  if (typeof window === 'undefined') return null
  const requests = window.__bootRequests
  const pending = requests?.[name]
  if (!requests || !pending) return null
  delete requests[name]
  const response = await pending
  return response.status ? response : null
}
