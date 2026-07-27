/**
 * The leaderboard contract.
 *
 * `game/` never imports anything from this directory — the engine does not
 * know a leaderboard exists. v0.2 adds a remote provider behind this same
 * interface, so the methods are async even though the local one isn't.
 *
 * The sorting and nickname rules live here rather than in a provider: every
 * implementation has to agree on them or two backends would rank the same
 * runs differently.
 */

import type { ModeId } from '../game/modes.ts'

export interface Entry {
  readonly nickname: string
  readonly mode: ModeId
  /** Primary score: highest level cleared. */
  readonly level: number
  /** Tiebreak, and a stat in its own right. */
  readonly avgReactionMs: number
  readonly fastestInputMs: number
  readonly totalInputs: number
  /** ISO timestamp. Stamped by the provider, so v0.2 can stamp server-side. */
  readonly achievedAt: string
  readonly runDurationMs: number
}

/** What a caller submits — the provider adds `achievedAt`. */
export type EntryDraft = Omit<Entry, 'achievedAt'>

export interface LeaderboardProvider {
  /**
   * How the UI names this board. v0.1 says "Local best" and means it — the
   * scores are on this machine only and the screen must not imply otherwise.
   */
  readonly label: string
  /** Highest first, capped at `TOP_N`. */
  top(mode: ModeId): Promise<readonly Entry[]>
  submit(draft: EntryDraft): Promise<Entry>
}

export const TOP_N = 20
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 12

/**
 * Level descending, then average reaction ascending, then oldest first — an
 * equal run that got there earlier keeps the higher rank.
 */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  return [...entries].sort(
    (a, b) =>
      b.level - a.level ||
      a.avgReactionMs - b.avgReactionMs ||
      a.achievedAt.localeCompare(b.achievedAt),
  )
}

export function normaliseNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX)
}

export function isValidNickname(raw: string): boolean {
  const value = normaliseNickname(raw)
  return value.length >= NICKNAME_MIN && value.length <= NICKNAME_MAX
}
