/**
 * The global board, over HTTP.
 *
 * Same origin as the page: in production the server serves the built client
 * too, and in development Vite proxies `/api` to it. No base URL to configure
 * and no CORS to get wrong.
 *
 * Failures are surfaced, not swallowed. There is no local board to fall back
 * to any more, so the screen has to be able to say "the board is unreachable"
 * rather than quietly showing an empty one, which would read as "nobody has
 * ever played".
 */

import {
  type Entry,
  type EntryDraft,
  type GameId,
  type LeaderboardProvider,
  type ModeKey,
  type SubmitResult,
  type TimeWindow,
} from './types.ts'

const ENDPOINT = '/api/leaderboard'
/** The board is a nicety; it must never hang the screen it's on. */
const TIMEOUT_MS = 8000

/** A failure worth showing the player, phrased for them rather than for a log. */
export class LeaderboardError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LeaderboardError'
  }
}

export function createRemoteProvider(): LeaderboardProvider {
  return {
    label: 'Global best',

    async top(game: GameId, mode: ModeKey, window: TimeWindow) {
      const query = new URLSearchParams({ game, mode, window })
      const body = await request<{ entries: Entry[] }>(`${ENDPOINT}?${query}`, {
        method: 'GET',
      })
      return body.entries ?? []
    },

    async submit(draft: EntryDraft) {
      return request<SubmitResult>(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })
    },
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    // Offline, DNS, connection refused, or our own timeout.
    throw new LeaderboardError(
      controller.signal.aborted
        ? 'The board took too long to answer'
        : "Can't reach the board",
      { cause: error },
    )
  } finally {
    window.clearTimeout(timer)
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const reason =
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `The board answered ${response.status}`
    throw new LeaderboardError(reason)
  }

  if (payload === null) throw new LeaderboardError('The board sent nonsense')
  return payload as T
}
