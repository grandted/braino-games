/**
 * Provider selection. The one place that decides which backend is live.
 *
 * v0.2 made this the remote one. The localStorage provider is gone: scores
 * are global, and a second silent board would have meant two different
 * answers to "what is the record".
 */

import { createRemoteProvider } from './remote.ts'
import type { LeaderboardProvider } from './types.ts'

export function createLeaderboard(): LeaderboardProvider {
  return createRemoteProvider()
}

export { absoluteTime, labelsFor, relativeTime } from './labels.ts'
export { readLastNickname, rememberNickname } from './nickname.ts'
export { LeaderboardError } from './remote.ts'
export {
  DEFAULT_WINDOW,
  NICKNAME_MAX,
  NICKNAME_MIN,
  TIME_WINDOWS,
  TOP_N,
  isValidNickname,
  normaliseNickname,
  timeWindowLabel,
} from './types.ts'
export type {
  Entry,
  EntryDraft,
  LeaderboardProvider,
  SubmitResult,
  TimeWindow,
} from './types.ts'
