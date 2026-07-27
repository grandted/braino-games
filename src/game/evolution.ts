/**
 * The evolution ladder.
 *
 * A **level** is an organism whose genome you are solving. Every correct input
 * bonds one **base pair**; fill the genome and you evolve. Genome sizes are
 * picked so each one completes exactly as a round is cleared — clearing round
 * N banks N(N+1)/2 base pairs, so the boundaries sit on the odd rounds:
 *
 *   virus     after round 1     jellyfish after round 9
 *   bacterium after round 3     fish      after round 11
 *   amoeba    after round 5     ...
 *
 * Pure and DOM-free: the server imports this to check that a submitted level
 * agrees with the rounds claimed alongside it.
 */

export interface Organism {
  /** 1-based tier. This is what the game calls the player's *level*. */
  readonly tier: number
  readonly name: string
  /** Base pairs this organism's genome needs. */
  readonly genome: number
  /** Palette anchor for the tier's colours and background. */
  readonly hue: number
}

interface LadderStep {
  readonly name: string
  readonly genome: number
  readonly hue: number
}

/**
 * The named ladder. Genomes are the base pairs earned during that tier, so the
 * running total lands on 1, 6, 15, 28, 45, 66, 91, 120, 171, 231.
 */
const LADDER: readonly LadderStep[] = [
  { name: 'virus', genome: 1, hue: 285 },
  { name: 'bacterium', genome: 5, hue: 255 },
  { name: 'amoeba', genome: 9, hue: 210 },
  { name: 'sponge', genome: 13, hue: 175 },
  { name: 'jellyfish', genome: 17, hue: 315 },
  { name: 'fish', genome: 21, hue: 195 },
  { name: 'amphibian', genome: 25, hue: 130 },
  { name: 'reptile', genome: 29, hue: 95 },
  { name: 'mammal', genome: 51, hue: 35 },
  { name: 'human', genome: 60, hue: 15 },
]

/** Nobody is reaching these. They exist so a freak run can't fall off the end. */
const BEYOND: readonly string[] = ['cyborg', 'starfarer', 'ascendant']

/** Each tier past the named ladder needs this many more base pairs. */
const TAIL_GENOME_STEP = 75
/** Hue advance per speculative tier, so they stay visually distinct. */
const TAIL_HUE_STEP = 47
/**
 * Hard stop on ladder walks. Validation caps rounds at 500, which is only
 * ~57 tiers, so this is unreachable — it just bounds the loop.
 */
const MAX_TIER = 9999

/** The organism at a given tier. Defined for every tier from 1 up. */
export function organismFor(tier: number): Organism {
  const index = Math.max(1, Math.floor(tier)) - 1

  const named = LADDER[index]
  if (named) {
    return { tier: index + 1, name: named.name, genome: named.genome, hue: named.hue }
  }

  const beyond = index - LADDER.length
  const last = LADDER[LADDER.length - 1]
  return {
    tier: index + 1,
    name: BEYOND[beyond] ?? `strain ${index + 1}`,
    genome: last.genome + (beyond + 1) * TAIL_GENOME_STEP,
    hue: (last.hue + (beyond + 1) * TAIL_HUE_STEP) % 360,
  }
}

/**
 * Which tier `basePairs` bonded puts you in. Zero base pairs is tier 1 — you
 * are always working on some organism.
 */
export function tierFor(basePairs: number): number {
  const pairs = Math.max(0, basePairs)
  let tier = 1
  let completed = 0

  while (tier < MAX_TIER) {
    completed += organismFor(tier).genome
    if (pairs < completed) break
    tier += 1
  }
  return tier
}

/** Base pairs needed to finish every tier below this one. */
export function basePairsBeforeTier(tier: number): number {
  let total = 0
  for (let step = 1; step < Math.max(1, tier); step += 1) {
    total += organismFor(step).genome
  }
  return total
}

export interface GenomeProgress {
  readonly organism: Organism
  /** Pairs bonded within the current genome. */
  readonly bonded: number
  /** Pairs the current genome needs in total. */
  readonly genome: number
}

/** Where a run stands: which organism, and how much of it is solved. */
export function genomeProgress(basePairs: number): GenomeProgress {
  const tier = tierFor(basePairs)
  const organism = organismFor(tier)
  return {
    organism,
    bonded: Math.max(0, basePairs) - basePairsBeforeTier(tier),
    genome: organism.genome,
  }
}
