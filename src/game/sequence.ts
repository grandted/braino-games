/**
 * Sequence generation and validation.
 *
 * The sequence is append-only: level N is level N-1's sequence plus one new
 * symbol. Regenerating each level would test short-term memory instead of
 * muscle memory, which is the whole point of the game.
 */

import type { ModeDef, SymbolId } from './modes.ts'

export type Sequence = readonly SymbolId[]

/** Injectable for deterministic tests; defaults to `Math.random`. */
export type Random = () => number

/** Level 1: a one-symbol sequence. */
export function startSequence(
  mode: ModeDef,
  random: Random = Math.random,
): Sequence {
  return extendSequence([], mode, random)
}

/** Level N+1: the same sequence with one fresh symbol on the end. */
export function extendSequence(
  sequence: Sequence,
  mode: ModeDef,
  random: Random = Math.random,
): Sequence {
  const index = Math.floor(random() * mode.symbols.length)
  const next = mode.symbols[Math.min(index, mode.symbols.length - 1)]
  return [...sequence, next.id]
}

/** Is `symbol` the right input at `index`? */
export function isCorrectAt(
  sequence: Sequence,
  index: number,
  symbol: SymbolId,
): boolean {
  return sequence[index] === symbol
}

/** Has the player reproduced the whole sequence? */
export function isComplete(sequence: Sequence, index: number): boolean {
  return index >= sequence.length
}
