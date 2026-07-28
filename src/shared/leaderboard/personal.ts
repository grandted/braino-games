/**
 * Your own record, per mode, on this device.
 *
 * This is **not** a leaderboard, and does not reopen the decision v0.2 made to
 * drop the local board: there is still exactly one board, it is global, and it
 * lives on the server. This is the arcade cabinet's "your best" — a target for
 * the vast majority of runs that will never trouble the global top twenty.
 *
 * Kept next to `nickname.ts` because both are local conveniences rather than
 * scores anyone else can see.
 */

import type { GameId, ModeKey } from './types.ts'

const STORAGE_KEY = 'tangent:best:v1'

export interface PersonalBest {
  readonly points: number
  readonly level: number
  readonly rounds: number
  /** ISO timestamp, local clock — nothing ranks on this. */
  readonly achievedAt: string
}

export interface RunRecord {
  readonly points: number
  readonly level: number
  readonly rounds: number
}

/** Keyed `game:mode`, so two games can share a mode name safely. */
type Store = Record<string, PersonalBest>

function keyFor(game: GameId, mode: ModeKey): string {
  return `${game}:${mode}`
}

export function readBest(game: GameId, mode: ModeKey): PersonalBest | null {
  return read()[keyFor(game, mode)] ?? null
}

/**
 * Record a finished run. Returns the standing best and whether this run beat
 * it — the caller uses that to decide whether to make a fuss.
 */
export function recordRun(
  game: GameId,
  mode: ModeKey,
  run: RunRecord,
): { best: PersonalBest; improved: boolean } {
  const previous = readBest(game, mode)
  // Points are the game's measure, so they are the measure here too.
  const improved = previous === null || run.points > previous.points
  if (!improved) return { best: previous, improved: false }

  const best: PersonalBest = {
    points: run.points,
    level: run.level,
    rounds: run.rounds,
    achievedAt: new Date().toISOString(),
  }
  write({ ...read(), [keyFor(game, mode)]: best })
  return { best, improved: true }
}

function read(): Store {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return {}
  }
  if (!raw) return {}

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const store: Store = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (isBest(value)) store[key] = value
    }
    return store
  } catch {
    // Hand-edited or half-written. A missing best is not worth a crash.
    return {}
  }
}

function write(store: Store): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage blocked or full; the run still happened.
  }
}

function isBest(value: unknown): value is PersonalBest {
  if (typeof value !== 'object' || value === null) return false
  const best = value as Record<string, unknown>
  return (
    isCount(best.points) &&
    isCount(best.level) &&
    isCount(best.rounds) &&
    typeof best.achievedAt === 'string'
  )
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
