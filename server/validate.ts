/**
 * The generic submission envelope.
 *
 * Everything here is true of any game on the platform: a body that is an
 * object, a nickname within the shared limits, and a known game. The moment a
 * check needs to know how a particular game *works*, it belongs in
 * `games/<id>.ts` instead — that split is what lets a second game be added
 * without touching this file's logic, only its table.
 */

import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  normaliseNickname,
  type EntryDraft,
} from '../src/shared/leaderboard/types.ts'
import { GAME_ID as TANGENT } from '../src/games/tangent/meta.ts'

export type Validation =
  | { readonly ok: true; readonly draft: EntryDraft }
  | { readonly ok: false; readonly reason: string }

/** A game's own rules, given a body that has already cleared the envelope. */
export type GameValidator = (
  raw: Record<string, unknown>,
  nickname: string,
) => Validation

/** Lazily imported so this module has no import cycle with the game rules. */
const VALIDATORS = new Map<string, () => Promise<GameValidator>>([
  [
    TANGENT,
    async () => (await import('./games/tangent.ts')).validateTangent,
  ],
])

export function isKnownGame(value: unknown): value is string {
  return typeof value === 'string' && VALIDATORS.has(value)
}

export async function validateDraft(body: unknown): Promise<Validation> {
  if (typeof body !== 'object' || body === null) {
    return fail('body must be an object')
  }
  const raw = body as Record<string, unknown>

  if (!isKnownGame(raw.game)) return fail('unknown game')

  if (typeof raw.nickname !== 'string') return fail('nickname must be a string')
  const nickname = normaliseNickname(raw.nickname)
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return fail(`nickname must be ${NICKNAME_MIN}-${NICKNAME_MAX} characters`)
  }

  const load = VALIDATORS.get(raw.game)
  if (!load) return fail('unknown game')
  const validate = await load()
  return validate(raw, nickname)
}

/** Shared by every game's rules, so a rejection reads the same wherever it comes from. */
export function fail(reason: string): Validation {
  return { ok: false, reason }
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
