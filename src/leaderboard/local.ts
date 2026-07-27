/**
 * localStorage provider — the whole of v0.1's leaderboard.
 *
 * Stored scores are trivially editable and that's accepted for v0.1, but
 * hand-edited or half-written data must not take the app down: everything
 * read back out is validated and anything that fails is dropped.
 */

import { MODES, type ModeId } from '../game/modes.ts'
import {
  TOP_N,
  normaliseNickname,
  sortEntries,
  type Entry,
  type LeaderboardProvider,
} from './types.ts'

const STORAGE_KEY = 'tangent:leaderboard:v1'
const NICKNAME_KEY = 'tangent:nickname'

/**
 * The last nickname used, so a mouse-only player can submit by clicking Save
 * without ever reaching for the keyboard.
 */
export function readLastNickname(): string {
  try {
    return window.localStorage.getItem(NICKNAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberNickname(nickname: string): void {
  try {
    window.localStorage.setItem(NICKNAME_KEY, nickname)
  } catch {
    // Same as scores: not being able to remember it isn't fatal.
  }
}

type Board = Record<ModeId, Entry[]>

export function createLocalProvider(): LeaderboardProvider {
  return {
    label: 'Local best',

    async top(mode) {
      return sortEntries(read()[mode]).slice(0, TOP_N)
    },

    async submit(draft) {
      const entry: Entry = {
        ...draft,
        nickname: normaliseNickname(draft.nickname),
        achievedAt: new Date().toISOString(),
      }
      const board = read()
      board[entry.mode] = sortEntries([...board[entry.mode], entry]).slice(
        0,
        TOP_N,
      )
      write(board)
      return entry
    },
  }
}

function emptyBoard(): Board {
  const board = {} as Board
  for (const mode of MODES) board[mode.id] = []
  return board
}

function read(): Board {
  const board = emptyBoard()
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private mode, disabled cookies) — play without a board.
    return board
  }
  if (!raw) return board

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return board
  }
  if (typeof parsed !== 'object' || parsed === null) return board

  for (const mode of MODES) {
    const entries = (parsed as Record<string, unknown>)[mode.id]
    if (!Array.isArray(entries)) continue
    board[mode.id] = entries.filter((entry): entry is Entry =>
      isEntry(entry, mode.id),
    )
  }
  return board
}

function write(board: Board): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
  } catch {
    // Quota or blocked storage. The run still happened; it just isn't kept.
  }
}

function isEntry(value: unknown, mode: ModeId): value is Entry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.nickname === 'string' &&
    entry.mode === mode &&
    isCount(entry.level) &&
    isCount(entry.avgReactionMs) &&
    isCount(entry.fastestInputMs) &&
    isCount(entry.totalInputs) &&
    isCount(entry.runDurationMs) &&
    typeof entry.achievedAt === 'string' &&
    !Number.isNaN(Date.parse(entry.achievedAt))
  )
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
