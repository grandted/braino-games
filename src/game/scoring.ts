/**
 * Points.
 *
 * A round pays for its depth and for how fast it was solved. Speed is measured
 * *per round*, so one sharp round still pays inside an otherwise cautious run,
 * and the multiplier is clamped so no single freak round dwarfs everything
 * else.
 *
 * Pure and DOM-free. The server imports `maxPoints` to bound what a submitted
 * run may claim, which only works while the engine and the server share this
 * one implementation.
 */

import { SCORING, basePairsAfterRound, clamp } from './modes.ts'
import { levelForRounds } from './evolution.ts'

/**
 * Speed multiplier for a round: 1x at the target, better when faster, bounded
 * at both ends.
 */
export function speedFactor(avgReactionMs: number): number {
  if (!Number.isFinite(avgReactionMs) || avgReactionMs <= 0) {
    return SCORING.speedMax
  }
  return clamp(
    SCORING.speedTargetMs / avgReactionMs,
    SCORING.speedMin,
    SCORING.speedMax,
  )
}

/** What clearing `round` at this average reaction time is worth. */
export function roundPoints(round: number, avgReactionMs: number): number {
  const base = SCORING.pointsPerRound * round
  return Math.round(base * speedFactor(avgReactionMs))
}

/** Paid when a genome completes. Later organisms are worth more. */
export function evolutionBonus(tier: number): number {
  return SCORING.evolutionBonus * tier
}

/**
 * The most a run of `rounds` rounds could possibly have scored: every round at
 * the maximum speed multiplier, plus every evolution bonus it would have
 * collected on the way.
 *
 * The server rejects anything above this, so it must never sit below what the
 * engine can actually award — hence the per-round rounding slack.
 */
export function maxPoints(rounds: number): number {
  if (rounds <= 0) return 0

  const fromRounds =
    SCORING.pointsPerRound * basePairsAfterRound(rounds) * SCORING.speedMax

  // Every level completed strictly below the one the run ended in.
  const tiersCompleted = levelForRounds(rounds) - 1
  let fromEvolutions = 0
  for (let tier = 1; tier <= tiersCompleted; tier += 1) {
    fromEvolutions += evolutionBonus(tier)
  }

  // Each round's award is rounded independently; allow half a point apiece.
  return Math.ceil(fromRounds + fromEvolutions + rounds / 2)
}
