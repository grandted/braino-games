/**
 * Light server-side checks on a submitted run.
 *
 * This is not anti-cheat and does not pretend to be: anyone can still post a
 * carefully-shaped lie. What it does is reject runs whose own numbers
 * contradict each other, which is what casual forgery and broken clients
 * actually produce.
 *
 * The lower bounds come from `game/modes.ts` — the same timing curve the game
 * plays — so the rules cannot drift apart from the game.
 */

import {
  MODES,
  TIMING,
  basePairsAfterRound,
  flashMsForRound,
  gapMsForRound,
  type ModeId,
} from '../src/game/modes.ts'
import { levelForRounds } from '../src/game/evolution.ts'
import { maxPoints } from '../src/game/scoring.ts'
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  normaliseNickname,
  type EntryDraft,
} from '../src/leaderboard/types.ts'

/** Beyond any human run; a claim past this is a broken client or a lie. */
const MAX_ROUNDS = 500
/** Nobody sees, decides and moves in under this. */
const MIN_HUMAN_MS = 80
/** No per-input timeout in the game, but an hour between inputs is noise. */
const MAX_REACTION_MS = 3_600_000
/** Timers only ever run late, never early — this is slack for rounding. */
const DURATION_TOLERANCE = 0.9

export type Validation =
  | { readonly ok: true; readonly draft: EntryDraft }
  | { readonly ok: false; readonly reason: string }

export function validateDraft(body: unknown): Validation {
  if (typeof body !== 'object' || body === null) {
    return fail('body must be an object')
  }
  const raw = body as Record<string, unknown>

  if (typeof raw.nickname !== 'string') return fail('nickname must be a string')
  const nickname = normaliseNickname(raw.nickname)
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return fail(`nickname must be ${NICKNAME_MIN}-${NICKNAME_MAX} characters`)
  }

  if (!isMode(raw.mode)) return fail('unknown mode')
  const mode: ModeId = raw.mode

  const rounds = raw.rounds
  if (!isCount(rounds) || rounds < 1 || rounds > MAX_ROUNDS) {
    return fail(`rounds must be between 1 and ${MAX_ROUNDS}`)
  }

  const totalInputs = raw.totalInputs
  if (!isCount(totalInputs)) return fail('totalInputs must be a whole number')
  // Clearing round N means having entered 1 + 2 + ... + N symbols at least.
  // Misses only ever add more, so this is a hard floor.
  const minInputs = basePairsAfterRound(rounds)
  if (totalInputs < minInputs) {
    return fail(`${rounds} rounds needs at least ${minInputs} inputs`)
  }

  // Level is derived, not reported: it is a function of rounds cleared, so
  // the server knows exactly which tier a run reached. A mismatch means the
  // client is out of date or the payload was hand-made.
  const level = raw.level
  const expectedLevel = levelForRounds(rounds)
  if (!isCount(level) || level !== expectedLevel) {
    return fail(`level for ${rounds} rounds must be ${expectedLevel}`)
  }

  const points = raw.points
  if (!isCount(points)) return fail('points must be a whole number')
  const ceiling = maxPoints(rounds)
  if (points > ceiling) {
    return fail(`points above what ${rounds} rounds can score (${ceiling})`)
  }

  const avgReactionMs = raw.avgReactionMs
  if (
    !isCount(avgReactionMs) ||
    avgReactionMs < MIN_HUMAN_MS ||
    avgReactionMs > MAX_REACTION_MS
  ) {
    return fail('avgReactionMs is not plausible')
  }

  const fastestInputMs = raw.fastestInputMs
  if (!isCount(fastestInputMs) || fastestInputMs < MIN_HUMAN_MS) {
    return fail('fastestInputMs is not plausible')
  }
  if (fastestInputMs > avgReactionMs) {
    return fail('fastestInputMs cannot exceed avgReactionMs')
  }

  const runDurationMs = raw.runDurationMs
  if (!isCount(runDurationMs)) return fail('runDurationMs must be a number')
  const floor = minRunDurationMs(rounds, totalInputs, fastestInputMs)
  if (runDurationMs < floor * DURATION_TOLERANCE) {
    return fail('run is shorter than its own rounds would take to play')
  }

  return {
    ok: true,
    draft: {
      nickname,
      mode,
      points,
      level,
      rounds,
      avgReactionMs,
      fastestInputMs,
      totalInputs,
      runDurationMs,
    },
  }
}

/**
 * The least time rounds 1..N can physically take: every playback the game had
 * to show, plus the player's own fastest input for each input they made.
 * Deliberately an undercount — it ignores the round they died in and any
 * replay a miss caused.
 */
function minRunDurationMs(
  rounds: number,
  totalInputs: number,
  fastestInputMs: number,
): number {
  let playback = 0
  for (let round = 1; round <= rounds; round += 1) {
    playback +=
      TIMING.playbackLeadInMs +
      round * (flashMsForRound(round) + gapMsForRound(round))
  }
  return playback + totalInputs * fastestInputMs
}

function isMode(value: unknown): value is ModeId {
  return MODES.some((mode) => mode.id === value)
}

function isCount(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0
  )
}

function fail(reason: string): Validation {
  return { ok: false, reason }
}
