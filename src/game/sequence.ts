/**
 * Sequence generation and validation.
 *
 * The sequence is append-only: round N is round N-1's sequence plus one new
 * symbol. Regenerating each round would test short-term memory instead of
 * muscle memory, which is the whole point of the game.
 *
 * Most modes append a random symbol. A mode carrying a `fixedSequence` appends
 * the next symbol of that instead — Pi mode is the digits of pi, so round N is
 * always the first N digits, in every run. Append-only still holds; the source
 * of the next symbol is the only thing that differs.
 */

import type { ModeDef, SymbolId } from './modes.ts'

export type Sequence = readonly SymbolId[]

/** Injectable for deterministic tests; defaults to `Math.random`. */
export type Random = () => number

/** Round 1: a one-symbol sequence. */
export function startSequence(
  mode: ModeDef,
  random: Random = Math.random,
): Sequence {
  return extendSequence([], mode, random)
}

/** Round N+1: the same sequence with one more symbol on the end. */
export function extendSequence(
  sequence: Sequence,
  mode: ModeDef,
  random: Random = Math.random,
): Sequence {
  return [...sequence, nextSymbol(sequence.length, mode, random)]
}

function nextSymbol(index: number, mode: ModeDef, random: Random): SymbolId {
  const fixed = mode.fixedSequence?.[index]
  // Falls through to random only if a fixed mode ever outran its own data.
  // Pi carries a thousand digits against a five-hundred-round cap, so this is
  // a guard rather than a path.
  if (fixed !== undefined) return fixed

  const pick = Math.floor(random() * mode.symbols.length)
  return mode.symbols[Math.min(pick, mode.symbols.length - 1)].id
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
