/**
 * The game state machine.
 *
 *   idle → playback → input → result → playback (next level)
 *                                    ↘ gameover
 *
 * No DOM access lives here — not a query, not an event listener, not a
 * class name. The engine emits events; the UI layer renders them. That
 * separation is what keeps the leaderboard and the renderer out of the
 * game rules.
 */

import {
  RULES,
  TIMING,
  flashMsForLevel,
  gapMsForLevel,
  type ModeDef,
  type ModeId,
  type SymbolId,
} from './modes.ts'
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
  /** Level cleared, next one queued. */
  | 'result'
  /** Window lost focus mid-playback; playback replays on return. */
  | 'paused'
  | 'gameover'

/** Everything the leaderboard and the gameover screen need about a run. */
export interface RunStats {
  readonly mode: ModeId
  /** Highest level fully cleared. Failing on level 1 gives 0. */
  readonly level: number
  readonly avgReactionMs: number
  readonly fastestInputMs: number
  readonly totalInputs: number
  readonly runDurationMs: number
  /** Wrong answers over the run — always `RULES.lives` on a finished run. */
  readonly mistakes: number
}

export type EngineEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'level'; level: number; sequence: Sequence }
  | { type: 'flashOn'; symbol: SymbolId; index: number; durationMs: number }
  | { type: 'flashOff'; symbol: SymbolId; index: number }
  | { type: 'playbackEnd' }
  | { type: 'accept'; symbol: SymbolId; index: number; reactionMs: number }
  | {
      type: 'reject'
      expected: SymbolId
      received: SymbolId
      /** Lives left after paying for this miss. Zero means the run is over. */
      livesLeft: number
    }
  | { type: 'lives'; left: number }
  | { type: 'levelClear'; level: number }
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
  /** How far through the sequence the player has got this level. */
  #inputIndex = 0
  #timers: TimerId[] = []
  #reactions: number[] = []
  /** End of playback, or the previous accepted input. */
  #lastInputAt = 0
  #runStartedAt = 0
  #clearedLevels = 0
  #livesLeft = RULES.lives
  #mistakes = 0

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

  /** The level being played right now (1-based). */
  get level(): number {
    return this.#sequence.length
  }

  get sequence(): Sequence {
    return this.#sequence
  }

  get livesLeft(): number {
    return this.#livesLeft
  }

  /** Begin a fresh run at level 1. Safe to call from any phase. */
  start(): void {
    this.#cancelTimers()
    this.#sequence = startSequence(this.#mode, this.#random)
    this.#reactions = []
    this.#clearedLevels = 0
    this.#livesLeft = RULES.lives
    this.#mistakes = 0
    this.#runStartedAt = this.#now()
    this.#emit({ type: 'lives', left: this.#livesLeft })
    this.#beginLevel()
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
    this.#inputIndex += 1
    this.#emit({ type: 'accept', symbol, index, reactionMs })

    if (isComplete(this.#sequence, this.#inputIndex)) this.#clearLevel()
  }

  /**
   * Focus left the window. Losing the middle of a playback would be unfair,
   * so playback is cancelled and replayed on return rather than failed.
   * Input and result phases carry on untouched — thinking time is free.
   */
  handleBlur(): void {
    if (this.#phase !== 'playback') return
    this.#cancelTimers()
    this.#setPhase('paused')
  }

  /** Focus came back: replay the current level from the top. */
  handleFocus(): void {
    if (this.#phase !== 'paused') return
    this.#beginLevel()
  }

  /** Abandon the run and drop every pending timer. */
  stop(): void {
    this.#cancelTimers()
    this.#setPhase('idle')
  }

  /* internals ----------------------------------------------------------- */

  #beginLevel(): void {
    this.#cancelTimers()
    this.#inputIndex = 0
    this.#emit({ type: 'level', level: this.level, sequence: this.#sequence })
    this.#setPhase('playback')
    this.#schedulePlayback()
  }

  #schedulePlayback(): void {
    const flashMs = flashMsForLevel(this.level)
    const gapMs = gapMsForLevel(this.level)
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

  #clearLevel(): void {
    this.#clearedLevels = this.level
    this.#setPhase('result')
    this.#emit({ type: 'levelClear', level: this.level })
    this.#after(TIMING.nextLevelDelayMs, () => {
      this.#sequence = extendSequence(this.#sequence, this.#mode, this.#random)
      this.#beginLevel()
    })
  }

  /**
   * A wrong answer costs a life. While lives remain the *same* level replays
   * from the top — the sequence is never regenerated, or the player would be
   * re-memorising instead of drilling the pattern they just lost.
   */
  #miss(expected: SymbolId, received: SymbolId): void {
    this.#mistakes += 1
    this.#livesLeft -= 1
    this.#setPhase('result')
    this.#emit({ type: 'reject', expected, received, livesLeft: this.#livesLeft })

    if (this.#livesLeft > 0) {
      this.#after(TIMING.failCueMs, () => this.#beginLevel())
      return
    }

    const stats = this.#buildStats()
    this.#after(TIMING.failCueMs, () => {
      this.#setPhase('gameover')
      this.#emit({ type: 'gameOver', stats })
    })
  }

  #buildStats(): RunStats {
    const total = this.#reactions.length
    const sum = this.#reactions.reduce((a, b) => a + b, 0)
    return {
      mode: this.#mode.id,
      level: this.#clearedLevels,
      avgReactionMs: total === 0 ? 0 : Math.round(sum / total),
      fastestInputMs: total === 0 ? 0 : Math.round(Math.min(...this.#reactions)),
      totalInputs: total,
      runDurationMs: Math.round(this.#now() - this.#runStartedAt),
      mistakes: this.#mistakes,
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

  /** Stale timeouts would flash symbols into the next round. */
  #cancelTimers(): void {
    for (const id of this.#timers) clearTimeout(id)
    this.#timers = []
  }
}
