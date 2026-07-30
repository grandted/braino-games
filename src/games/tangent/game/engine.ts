/**
 * The game state machine.
 *
 *   idle → playback → input → result → playback (next round)
 *                                    ↘ gameover
 *
 * Vocabulary, because it changed in v0.3 and the old name is still all over
 * the git history: a **round** is one sequence reproduction (round N has N
 * symbols), and a **level** is the evolutionary tier — the organism whose
 * genome the run is currently solving. Every correct input bonds one base
 * pair; filling a genome evolves the run to the next level.
 *
 * No DOM access lives here — not a query, not an event listener, not a
 * class name. The engine emits events; the UI layer renders them. That
 * separation is what keeps the leaderboard and the renderer out of the
 * game rules.
 */

import {
  RULES,
  TIMING,
  basePairsAfterRound,
  flashMsForRound,
  gapMsForRound,
  type ModeDef,
  type ModeId,
  type SymbolId,
} from './modes.ts'
import {
  genomeFor,
  genomeProgress,
  levelForRounds,
  organismFor,
  type GenomeProgress,
} from './evolution.ts'
import { evolutionBonus, roundPoints } from './scoring.ts'
import {
  extendSequence,
  isComplete,
  isCorrectAt,
  startSequence,
  type Random,
  type Sequence,
} from './sequence.ts'

export type Phase =
  | 'idle'
  /** Sequence is flashing. Input is locked and swallowed. */
  | 'playback'
  /** Player is reproducing the sequence. */
  | 'input'
  /** Round cleared, next one queued. */
  | 'result'
  /** Window lost focus mid-playback; playback replays on return. */
  | 'paused'
  | 'gameover'

/** Everything the leaderboard and the gameover screen need about a run. */
export interface RunStats {
  readonly mode: ModeId
  /** Primary score. */
  readonly points: number
  /** Evolutionary tier reached. */
  readonly level: number
  /** Name of the organism at that tier, for display. */
  readonly organism: string
  /** Rounds fully cleared. Failing in round 1 gives 0. */
  readonly rounds: number
  /** Base pairs banked — the genome progress behind `level`. */
  readonly basePairs: number
  readonly avgReactionMs: number
  readonly fastestInputMs: number
  readonly totalInputs: number
  readonly runDurationMs: number
  /** Wrong answers over the run. Equals the lives it had, free ones included. */
  readonly mistakes: number
  /** Free lives earned by clearing round milestones. Almost always zero. */
  readonly freeLives: number
}

export type EngineEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'round'; round: number; sequence: Sequence }
  | { type: 'flashOn'; symbol: SymbolId; index: number; durationMs: number }
  | { type: 'flashOff'; symbol: SymbolId; index: number }
  | { type: 'playbackEnd' }
  | {
      type: 'accept'
      symbol: SymbolId
      index: number
      reactionMs: number
      /** Base pairs bonded so far, banked plus this round's progress. */
      basePairs: number
    }
  | {
      type: 'reject'
      expected: SymbolId
      received: SymbolId
      /** Lives left after paying for this miss. Zero means the run is over. */
      livesLeft: number
      /** Base pairs after the failed round's progress is unbonded. */
      basePairs: number
    }
  | { type: 'lives'; left: number; max: number }
  | { type: 'freeLife'; round: number; left: number; max: number }
  | {
      type: 'roundClear'
      round: number
      points: number
      totalPoints: number
      basePairs: number
    }
  | {
      type: 'evolve'
      level: number
      organism: string
      genome: number
      bonus: number
      totalPoints: number
    }
  | { type: 'gameOver'; stats: RunStats }

export interface EngineOptions {
  readonly mode: ModeDef
  readonly emit: (event: EngineEvent) => void
  readonly random?: Random
  readonly now?: () => number
}

type TimerId = ReturnType<typeof setTimeout>

export class Engine {
  readonly #mode: ModeDef
  readonly #emit: (event: EngineEvent) => void
  readonly #random: Random
  readonly #now: () => number

  #phase: Phase = 'idle'
  #sequence: Sequence = []
  /** How far through the sequence the player has got this round. */
  #inputIndex = 0
  #timers: TimerId[] = []
  #reactions: number[] = []
  /** Reaction times within the current round only — this round's speed score. */
  #roundReactions: number[] = []
  /** End of playback, or the previous accepted input. */
  #lastInputAt = 0
  #runStartedAt = 0
  #clearedRounds = 0
  #points = 0
  #livesLeft = RULES.lives
  #livesMax = RULES.lives
  #mistakes = 0
  #freeLives = 0
  /**
   * The next round, scheduled but not started yet.
   *
   * Losing focus has to hold this as surely as it holds a playback in
   * progress. The runway between rounds is only a beat — `nextRoundDelayMs`
   * after a clear, `failCueMs` after a miss — but a sequence that flashes at a
   * window nobody is looking at is a round the player never saw and cannot
   * answer, and the old code let exactly that through.
   *
   * It holds the work itself rather than a flag, and that is the point: the
   * wait before the *gameover* lives in the same `result` phase, and pausing
   * it would strand a finished run forever. That wait simply never sets this,
   * so it can never be resumed by mistake.
   */
  #pendingRound: (() => void) | null = null

  constructor(options: EngineOptions) {
    this.#mode = options.mode
    this.#emit = options.emit
    this.#random = options.random ?? Math.random
    this.#now = options.now ?? (() => performance.now())
  }

  get mode(): ModeDef {
    return this.#mode
  }

  get phase(): Phase {
    return this.#phase
  }

  /** The round being played right now (1-based). */
  get round(): number {
    return this.#sequence.length
  }

  get sequence(): Sequence {
    return this.#sequence
  }

  get livesLeft(): number {
    return this.#livesLeft
  }

  /** Starting lives plus any earned. Grows past `RULES.lives`. */
  get livesMax(): number {
    return this.#livesMax
  }

  get points(): number {
    return this.#points
  }

  /**
   * Base pairs bonded: everything banked by cleared rounds, plus the progress
   * made so far in the round underway. A miss rolls the live part back.
   */
  get basePairs(): number {
    return basePairsAfterRound(this.#clearedRounds) + this.#inputIndex
  }

  /**
   * The evolutionary tier the run stands in. Driven by rounds *cleared*, so
   * it never ticks over mid-round.
   */
  get level(): number {
    return levelForRounds(this.#clearedRounds)
  }

  /** Which organism, and how much of its genome is bonded. */
  get genome(): GenomeProgress {
    return genomeProgress(this.#clearedRounds, this.basePairs)
  }

  /** Begin a fresh run at round 1. Safe to call from any phase. */
  start(): void {
    this.#cancelTimers()
    this.#pendingRound = null
    this.#sequence = startSequence(this.#mode, this.#random)
    this.#reactions = []
    this.#clearedRounds = 0
    this.#points = 0
    this.#livesLeft = RULES.lives
    this.#livesMax = RULES.lives
    this.#mistakes = 0
    this.#freeLives = 0
    this.#runStartedAt = this.#now()
    this.#emit({ type: 'lives', left: this.#livesLeft, max: this.#livesMax })
    this.#beginRound()
  }

  /**
   * Feed the engine one player input. Anything arriving outside the input
   * phase is swallowed — never buffered, or the player would "pre-load"
   * answers during playback.
   */
  press(symbol: SymbolId): void {
    if (this.#phase !== 'input') return

    const index = this.#inputIndex
    if (!isCorrectAt(this.#sequence, index, symbol)) {
      this.#miss(this.#sequence[index], symbol)
      return
    }

    const at = this.#now()
    const reactionMs = at - this.#lastInputAt
    this.#lastInputAt = at
    this.#reactions.push(reactionMs)
    this.#roundReactions.push(reactionMs)
    this.#inputIndex += 1
    this.#emit({
      type: 'accept',
      symbol,
      index,
      reactionMs,
      basePairs: this.basePairs,
    })

    if (isComplete(this.#sequence, this.#inputIndex)) this.#clearRound()
  }

  /**
   * Focus left the window. Losing the middle of a playback would be unfair,
   * so playback is cancelled and replayed on return rather than failed — and
   * so is a round that was queued but has not flashed yet, which is just as
   * unseeable.
   *
   * Input is untouched: thinking time is free, and a player who tabs away
   * mid-answer finds the round exactly where they left it. So is the wait
   * before the gameover screen, which has no round behind it to resume.
   */
  handleBlur(): void {
    if (this.#phase !== 'playback' && this.#pendingRound === null) return
    // Deliberately does not clear #pendingRound: holding it is what tells
    // handleFocus which round to come back to.
    this.#cancelTimers()
    this.#setPhase('paused')
  }

  /** Focus came back: pick the round back up, from the top of its playback. */
  handleFocus(): void {
    if (this.#phase !== 'paused') return
    const pending = this.#pendingRound
    this.#pendingRound = null
    // Either the round that was still queued when focus went, or the one that
    // was mid-flash. Both start over from the first symbol.
    if (pending) pending()
    else this.#beginRound()
  }

  /** Abandon the run and drop every pending timer. */
  stop(): void {
    this.#cancelTimers()
    // A round held by a pause must not survive the run it belonged to.
    this.#pendingRound = null
    this.#setPhase('idle')
  }

  /* internals ----------------------------------------------------------- */

  #beginRound(): void {
    this.#cancelTimers()
    this.#inputIndex = 0
    this.#roundReactions = []
    this.#emit({ type: 'round', round: this.round, sequence: this.#sequence })
    this.#setPhase('playback')
    this.#schedulePlayback()
  }

  #schedulePlayback(): void {
    const flashMs = flashMsForRound(this.round)
    const gapMs = gapMsForRound(this.round)
    let at = TIMING.playbackLeadInMs

    this.#sequence.forEach((symbol, index) => {
      this.#after(at, () => {
        this.#emit({ type: 'flashOn', symbol, index, durationMs: flashMs })
      })
      at += flashMs
      this.#after(at, () => {
        this.#emit({ type: 'flashOff', symbol, index })
      })
      // The gap lands *before* the next flash, so a repeated symbol reads as
      // two flashes rather than one long one.
      at += gapMs
    })

    this.#after(at, () => {
      this.#emit({ type: 'playbackEnd' })
      // First reaction time is measured from the end of playback.
      this.#lastInputAt = this.#now()
      this.#setPhase('input')
    })
  }

  #clearRound(): void {
    const round = this.round
    const levelBefore = levelForRounds(round - 1)
    const levelAfter = levelForRounds(round)

    this.#clearedRounds = round
    this.#inputIndex = 0
    this.#setPhase('result')

    const award = roundPoints(round, this.#averageRoundReaction())
    this.#points += award
    this.#emit({
      type: 'roundClear',
      round,
      points: award,
      totalPoints: this.#points,
      basePairs: this.basePairs,
    })

    // Genomes are sized to complete exactly on a round boundary, so this is
    // the only place evolution can happen. The loop covers the theoretical
    // case of one round spanning more than one tiny genome.
    for (let tier = levelBefore; tier < levelAfter; tier += 1) {
      const bonus = evolutionBonus(tier)
      this.#points += bonus
      const organism = organismFor(tier)
      this.#emit({
        type: 'evolve',
        level: tier,
        organism: organism.name,
        genome: genomeFor(tier),
        bonus,
        totalPoints: this.#points,
      })
    }

    // A life every hundredth round. Nobody has earned one yet.
    if (round % RULES.freeLifeEveryRounds === 0) {
      this.#freeLives += 1
      this.#livesLeft += 1
      this.#livesMax += 1
      this.#emit({
        type: 'freeLife',
        round,
        left: this.#livesLeft,
        max: this.#livesMax,
      })
    }

    this.#queueRound(TIMING.nextRoundDelayMs, () => {
      this.#sequence = extendSequence(this.#sequence, this.#mode, this.#random)
      this.#beginRound()
    })
  }

  /**
   * A wrong answer costs a life. While lives remain the *same* round replays
   * from the top — the sequence is never regenerated, or the player would be
   * re-memorising instead of drilling the pattern they just lost. The base
   * pairs earned during the failed attempt unbond with it.
   */
  #miss(expected: SymbolId, received: SymbolId): void {
    this.#mistakes += 1
    this.#livesLeft -= 1
    this.#inputIndex = 0
    this.#roundReactions = []
    this.#setPhase('result')
    this.#emit({
      type: 'reject',
      expected,
      received,
      livesLeft: this.#livesLeft,
      basePairs: this.basePairs,
    })

    if (this.#livesLeft > 0) {
      this.#queueRound(TIMING.failCueMs, () => this.#beginRound())
      return
    }

    // Not queued as a round: the run is over, and a blur must let this land
    // rather than hold it. See #pendingRound.
    const stats = this.#buildStats()
    this.#after(TIMING.failCueMs, () => {
      this.#setPhase('gameover')
      this.#emit({ type: 'gameOver', stats })
    })
  }

  /** Mean reaction across the round just cleared — this round's speed score. */
  #averageRoundReaction(): number {
    if (this.#roundReactions.length === 0) return 0
    const sum = this.#roundReactions.reduce((a, b) => a + b, 0)
    return sum / this.#roundReactions.length
  }

  #buildStats(): RunStats {
    const total = this.#reactions.length
    const sum = this.#reactions.reduce((a, b) => a + b, 0)
    const banked = basePairsAfterRound(this.#clearedRounds)
    const progress = genomeProgress(this.#clearedRounds, banked)

    return {
      mode: this.#mode.id,
      points: this.#points,
      level: progress.organism.tier,
      organism: progress.organism.name,
      rounds: this.#clearedRounds,
      basePairs: banked,
      avgReactionMs: total === 0 ? 0 : Math.round(sum / total),
      fastestInputMs: total === 0 ? 0 : Math.round(Math.min(...this.#reactions)),
      totalInputs: total,
      runDurationMs: Math.round(this.#now() - this.#runStartedAt),
      mistakes: this.#mistakes,
      freeLives: this.#freeLives,
    }
  }

  #setPhase(phase: Phase): void {
    if (this.#phase === phase) return
    this.#phase = phase
    this.#emit({ type: 'phase', phase })
  }

  #after(delayMs: number, run: () => void): void {
    this.#timers.push(setTimeout(run, delayMs))
  }

  /**
   * Schedule the next round, and record it as resumable while it waits. Only
   * the two paths that really do lead to another playback use this.
   */
  #queueRound(delayMs: number, begin: () => void): void {
    this.#pendingRound = begin
    this.#after(delayMs, () => {
      this.#pendingRound = null
      begin()
    })
  }

  /** Stale timeouts would flash symbols into the next round. */
  #cancelTimers(): void {
    for (const id of this.#timers) clearTimeout(id)
    this.#timers = []
  }
}
