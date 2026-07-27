/**
 * The leaderboard contract, shared verbatim by the browser and the server.
 *
 * `game/` never imports anything from this directory — the engine does not
 * know a leaderboard exists.
 *
 * The sorting, window and nickname rules live here rather than in a provider
 * or in the server: both ends have to agree on them or the board the client
 * renders would not be the board the server thinks it served.
 */

import type { ModeId } from '../game/modes.ts'

export interface Entry {
  /** Server-assigned. Stable enough to highlight a row you just earned. */
  readonly id: string
  readonly nickname: string
  readonly mode: ModeId
  /** Primary score. Speed is what separates the board. */
  readonly points: number
  /** Evolutionary tier reached — see game/evolution.ts. */
  readonly level: number
  /** Rounds cleared. Was called `level` before v0.3. */
  readonly rounds: number
  /** Tiebreak, and a stat in its own right. */
  readonly avgReactionMs: number
  readonly fastestInputMs: number
  readonly totalInputs: number
  /** ISO timestamp, stamped server-side so a client clock cannot game it. */
  readonly achievedAt: string
  readonly runDurationMs: number
}

/** What a caller submits — the server adds `id` and `achievedAt`. */
export type EntryDraft = Omit<Entry, 'id' | 'achievedAt'>

export interface SubmitResult {
  readonly entry: Entry
  /** All-time position for that mode, or null if it missed the board. */
  readonly rank: number | null
}

/* Time windows ------------------------------------------------------------
 * A global board is only interesting if a newcomer can still see themselves
 * on it, so the board is sliceable by when the run happened.
 */

export type TimeWindow = '24h' | 'week' | 'month' | 'all'

export const TIME_WINDOWS: ReadonlyArray<{
  readonly id: TimeWindow
  readonly label: string
  /** How far back the slice reaches; null means all of it. */
  readonly ms: number | null
}> = [
  { id: '24h', label: 'Last 24h', ms: 86_400_000 },
  { id: 'week', label: 'Last week', ms: 7 * 86_400_000 },
  { id: 'month', label: 'Last month', ms: 30 * 86_400_000 },
  { id: 'all', label: 'All time', ms: null },
]

export const DEFAULT_WINDOW: TimeWindow = 'week'

export function isTimeWindow(value: unknown): value is TimeWindow {
  return TIME_WINDOWS.some((window) => window.id === value)
}

export function timeWindowLabel(id: TimeWindow): string {
  return TIME_WINDOWS.find((window) => window.id === id)?.label ?? id
}

/** The ISO instant a window starts at, or null for all-time. */
export function windowCutoff(id: TimeWindow, now: Date = new Date()): string | null {
  const span = TIME_WINDOWS.find((window) => window.id === id)?.ms
  if (span === null || span === undefined) return null
  return new Date(now.getTime() - span).toISOString()
}

export interface LeaderboardProvider {
  /**
   * How the UI names this board. It says "Global best" and means it — these
   * scores are everyone's, and the screen must not imply otherwise.
   */
  readonly label: string
  /** Highest first, capped at `TOP_N`. Rejects if the board is unreachable. */
  top(mode: ModeId, window: TimeWindow): Promise<readonly Entry[]>
  submit(draft: EntryDraft): Promise<SubmitResult>
}

export const TOP_N = 20
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 12

/**
 * Points first — that is the whole point of scoring on speed. A quick player
 * can top the board with fewer rounds than the player below them.
 *
 * Then level, then rounds, then average reaction, then oldest first so an
 * equal run that got there earlier keeps the higher rank.
 *
 * Note that level is a function of rounds (genomes complete on round
 * boundaries), so it never breaks a tie that rounds wouldn't. It is in the
 * chain because it is what the board displays, not because it discriminates.
 *
 * `server/db.ts` mirrors this order in SQL, in both the listing query and the
 * rank query. Change one and you must change all three.
 */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      b.points - a.points ||
      b.level - a.level ||
      b.rounds - a.rounds ||
      a.avgReactionMs - b.avgReactionMs ||
      a.achievedAt.localeCompare(b.achievedAt),
  )
}

/**
 * Trim, collapse whitespace, drop control characters, clamp length. The
 * server runs this too — a nickname arriving by curl gets the same treatment
 * as one typed into the form.
 */
export function normaliseNickname(raw: string): string {
  return (
    raw
      // Whitespace first, so a newline becomes a space rather than vanishing
      // and welding two words together.
      .replace(/\s+/gu, ' ')
      // Then the invisibles: zero-width joiners, RTL overrides, other controls.
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .trim()
      .slice(0, NICKNAME_MAX)
      .trim()
  )
}

export function isValidNickname(raw: string): boolean {
  const value = normaliseNickname(raw)
  return value.length >= NICKNAME_MIN && value.length <= NICKNAME_MAX
}
