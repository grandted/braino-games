/**
 * The evolution ladder.
 *
 * A **level** is an organism. You reach the next one by clearing rounds, and
 * each level costs more rounds than the last — a couple at first, then many:
 *
 *   level 2 at round   3     level 6 at round  41
 *   level 3 at round   7     level 7 at round  63
 *   level 4 at round  14     level 8 at round  92
 *   level 5 at round  25     level 9 at round 129
 *
 * The gaps are 2, 4, 7, 11, 16, 22 … — each one wider than the last — which
 * closes to `roundsCleared = k - 1 + (k-1)k(k+1)/6`, the tetrahedral numbers.
 *
 * Calibrated against what people actually do. Most runs end between rounds 8
 * and 20, so a typical run reaches level 3 and a strong one level 4 or 5.
 * Everything past that is meant to be rare. Round 100 is level 8 and is not
 * expected to be reachable by anyone — see the kill screen below.
 *
 * Pure and DOM-free: the server imports this to check that a submitted level
 * agrees with the rounds claimed alongside it.
 */

import { basePairsAfterRound } from './modes.ts'

export interface Organism {
  /** 1-based tier. This is the player's *level*. */
  readonly tier: number
  readonly name: string
  /** Palette anchor for the tier's colours and background. */
  readonly hue: number
  /** True once the ladder has left the named organisms behind. */
  readonly anomaly: boolean
}

/**
 * Hues are spaced widest at the bottom of the ladder, because those are the
 * transitions people actually reach — the backdrop wash is deliberately faint,
 * and a 30° step would be invisible at that opacity. The gaps tighten higher
 * up, where the run also drifts from cold sea life toward warm land animals.
 */
const LADDER: readonly { name: string; hue: number }[] = [
  { name: 'virus', hue: 285 }, // violet
  { name: 'bacterium', hue: 190 }, // cyan
  { name: 'amoeba', hue: 130 }, // green
  { name: 'sponge', hue: 35 }, // amber
  { name: 'jellyfish', hue: 320 }, // magenta
  { name: 'fish', hue: 205 }, // blue
  { name: 'amphibian', hue: 95 }, // yellow-green
  { name: 'reptile', hue: 60 }, // yellow
  { name: 'mammal', hue: 25 }, // orange
  { name: 'human', hue: 0 }, // red
]

/**
 * Past human the ladder stops naming animals. Reaching level 11 means round
 * 231, which nobody is going to do; if they somehow do, the game should feel
 * like it has gone somewhere it was not built to go.
 */
const ANOMALIES: readonly string[] = ['???', 'anomaly', 'observer', 'the pattern']

/** Level at which the named ladder runs out and the kill screen begins. */
export const ANOMALY_LEVEL = LADDER.length + 1

/** Bounds every ladder walk. Round 500 is only level 14, so this is slack. */
const MAX_LEVEL = 999

/**
 * Rounds that must be **cleared** to stand at `level`. Level 1 needs none —
 * a fresh run is already a virus.
 *
 * Level 2 needs 2 cleared, so it arrives as round 3 begins; level 3 needs 6,
 * arriving at round 7. That is what "L2 at round 3" means throughout.
 */
export function roundsForLevel(level: number): number {
  const k = Math.max(1, Math.floor(level))
  return k - 1 + ((k - 1) * k * (k + 1)) / 6
}

/** The round that is played at this level first. Display convenience. */
export function firstRoundAtLevel(level: number): number {
  return roundsForLevel(level) + 1
}

/** The level reached after clearing `rounds` rounds. Zero rounds is level 1. */
export function levelForRounds(rounds: number): number {
  const cleared = Math.max(0, Math.floor(rounds))
  let level = 1
  while (level < MAX_LEVEL && roundsForLevel(level + 1) <= cleared) {
    level += 1
  }
  return level
}

export function organismFor(level: number): Organism {
  const tier = Math.max(1, Math.floor(level))
  const named = LADDER[tier - 1]
  if (named) {
    return { tier, name: named.name, hue: named.hue, anomaly: false }
  }

  const past = tier - ANOMALY_LEVEL
  return {
    tier,
    name: ANOMALIES[past] ?? `strain ${tier}`,
    // Hue leaves the ladder entirely out here. Offset so the first anomaly
    // doesn't land on human's red and read as "nothing changed".
    hue: (160 + past * 97) % 360,
    anomaly: true,
  }
}

/**
 * Base pairs a level's genome needs: every correct input made during the
 * rounds that level spans. Sized this way, the strand completes exactly as
 * the level's final round is cleared.
 */
export function genomeFor(level: number): number {
  const tier = Math.max(1, Math.floor(level))
  return (
    basePairsAfterRound(roundsForLevel(tier + 1)) -
    basePairsAfterRound(roundsForLevel(tier))
  )
}

export interface GenomeProgress {
  readonly organism: Organism
  /** Pairs bonded within the current genome. */
  readonly bonded: number
  /** Pairs the current genome needs in total. */
  readonly genome: number
}

/**
 * Where a run stands. Level comes from rounds *cleared* so it never changes
 * mid-round; the fill comes from base pairs so the strand moves with every
 * input.
 */
export function genomeProgress(
  roundsCleared: number,
  basePairs: number,
): GenomeProgress {
  const level = levelForRounds(roundsCleared)
  const organism = organismFor(level)
  const alreadyBanked = basePairsAfterRound(roundsForLevel(level))
  return {
    organism,
    bonded: Math.max(0, basePairs - alreadyBanked),
    genome: genomeFor(level),
  }
}
