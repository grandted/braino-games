/**
 * Provider selection. The one place that decides which backend is live.
 *
 * v0.2 adds a remote provider and changes this function — and nothing else.
 */

import { createLocalProvider } from './local.ts'
import type { LeaderboardProvider } from './types.ts'

export function createLeaderboard(): LeaderboardProvider {
  return createLocalProvider()
}

export { absoluteTime, labelsFor, relativeTime } from './labels.ts'
export { readLastNickname, rememberNickname } from './local.ts'
export {
  NICKNAME_MAX,
  NICKNAME_MIN,
  TOP_N,
  isValidNickname,
  normaliseNickname,
} from './types.ts'
export type { Entry, EntryDraft, LeaderboardProvider } from './types.ts'
