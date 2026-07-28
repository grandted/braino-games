/**
 * Facts about this game that both its own code and the platform need.
 *
 * Separate from `index.ts` because `ui/screens.ts` needs the id (to scope the
 * leaderboard and personal bests) and `index.ts` imports `ui/screens.ts` —
 * putting the id in `index.ts` would make that a cycle.
 */

/** Permanent: it keys this game's leaderboard rows and its URL. */
export const GAME_ID = 'tangent'

/** Signature hue. Drives the card and the in-game accents. */
export const GAME_HUE = 285
