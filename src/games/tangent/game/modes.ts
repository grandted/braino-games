/**
 * Mode definitions and every timing constant in the game.
 *
 * Nothing here touches the DOM. Colours are named as CSS custom properties
 * rather than literals so the palette stays in one place (styles/base.css).
 */

import { PI_DIGITS } from './pi.ts'

export type SymbolId =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'clickLeft'
  | 'clickRight'
  // The 3x3, named by compass point: NW is top-left, C is the centre.
  | 'gridNW'
  | 'gridN'
  | 'gridNE'
  | 'gridW'
  | 'gridC'
  | 'gridE'
  | 'gridSW'
  | 'gridS'
  | 'gridSE'
  // Pi: one symbol per digit.
  | 'd0'
  | 'd1'
  | 'd2'
  | 'd3'
  | 'd4'
  | 'd5'
  | 'd6'
  | 'd7'
  | 'd8'
  | 'd9'

export type ModeId = 'arrows' | 'clicks' | 'grid' | 'pi'

export interface SymbolDef {
  readonly id: SymbolId
  /** Glyph shown on the pad. */
  readonly glyph: string
  /** Human name, used for aria labels and the gameover recap. */
  readonly name: string
  /** CSS custom property holding this symbol's colour. */
  readonly colorVar: string
  /** Tone pitch in Hz. Low pitches sit low on the pad, high sit high. */
  readonly toneHz: number
  /**
   * Stereo position, -1 to 1, matching where the symbol sits on the pad.
   * Hearing left on the left is not decoration: pairing a sound with a
   * direction is another handle for recall, which is the point of the game.
   */
  readonly pan: number
  /** `KeyboardEvent.key` values that trigger this symbol. */
  readonly keys: readonly string[]
  /** `MouseEvent.button` that triggers it anywhere in the play area. */
  readonly mouseButton: number | null
}

export interface ModeDef {
  readonly id: ModeId
  readonly name: string
  readonly tagline: string
  /** How board.ts arranges the pads. */
  readonly layout: 'cluster' | 'split' | 'grid' | 'keypad'
  /**
   * A sequence this mode always plays, instead of a random one. Pi mode is
   * the digits of pi: round N is the first N digits, every run, forever.
   *
   * That makes it the one mode where knowing the answer in advance is the
   * entire point — and where practice compounds across runs rather than
   * within one.
   */
  readonly fixedSequence?: readonly SymbolId[]
  /**
   * Show the digits entered so far as text, the way a person would write
   * them. Only meaningful for a mode whose symbols are digits.
   */
  readonly readout?: boolean
  /**
   * Root of the ambient bed, chosen to sit under this mode's symbol pitches.
   * Arrows are E-G-B-D, so the bed is an E; clicks are A-E, so it is an A.
   * Symbol pitches never transpose — they are the memory anchor — so the bed
   * has to be the thing that agrees with them.
   */
  readonly ambientRootHz: number
  readonly symbols: readonly SymbolDef[]
}

const ARROWS: ModeDef = {
  id: 'arrows',
  name: 'Arrows',
  // Device-neutral on purpose: on a phone these are four pads, not four keys.
  tagline: 'Four directions. Patterns turn brutal fast.',
  layout: 'cluster',
  ambientRootHz: 82.41, // E2
  symbols: [
    {
      id: 'up',
      glyph: '↑',
      name: 'up',
      colorVar: '--sym-up',
      toneHz: 587.33, // D5
      pan: 0,
      keys: ['ArrowUp'],
      mouseButton: null,
    },
    {
      id: 'left',
      glyph: '←',
      name: 'left',
      colorVar: '--sym-left',
      toneHz: 392.0, // G4
      pan: -0.65,
      keys: ['ArrowLeft'],
      mouseButton: null,
    },
    {
      id: 'down',
      glyph: '↓',
      name: 'down',
      colorVar: '--sym-down',
      toneHz: 329.63, // E4
      pan: 0,
      keys: ['ArrowDown'],
      mouseButton: null,
    },
    {
      id: 'right',
      glyph: '→',
      name: 'right',
      colorVar: '--sym-right',
      toneHz: 493.88, // B4
      pan: 0.65,
      keys: ['ArrowRight'],
      mouseButton: null,
    },
  ],
}

const CLICKS: ModeDef = {
  id: 'clicks',
  name: 'Clicks',
  tagline: 'Two buttons. Longer runs, a different kind of hard.',
  layout: 'split',
  ambientRootHz: 110.0, // A2
  symbols: [
    {
      id: 'clickLeft',
      glyph: '◧',
      name: 'left click',
      colorVar: '--sym-click-left',
      toneHz: 440.0, // A4
      pan: -0.55,
      // Arrow keys keep clicks mode playable without a mouse.
      keys: ['ArrowLeft'],
      mouseButton: 0,
    },
    {
      id: 'clickRight',
      glyph: '◨',
      name: 'right click',
      colorVar: '--sym-click-right',
      toneHz: 659.25, // E5
      pan: 0.55,
      keys: ['ArrowRight'],
      mouseButton: 2,
    },
  ],
}

/**
 * Nine cells, the hardest pattern space in the game at 3.17 bits a step.
 *
 * The sound of a cell tells you where it was, twice over: the column picks the
 * note and the stereo position, the row picks the octave. Higher on screen is
 * literally higher, and further right is further right.
 *
 *   Q W E        E5 G5 B5      pan  -0.7   0  +0.7
 *   A S D        E4 G4 B4
 *   Z X C        E3 G3 B3
 *
 * QWE/ASD/ZXC is the primary binding because it exists on every keyboard,
 * laptops included. The numpad is a secondary binding and only answers with
 * NumLock on — with it off the numpad reports ArrowUp/Home/PageUp rather than
 * digits, which is a keyboard quirk rather than something we can fix here.
 */
const GRID: ModeDef = {
  id: 'grid',
  name: 'Grid',
  tagline: 'Nine cells. Short runs, and no room to guess.',
  layout: 'grid',
  ambientRootHz: 82.41, // E2 — the same E the cells are built from
  symbols: [
    {
      id: 'gridNW',
      glyph: 'Q',
      name: 'top left',
      colorVar: '--sym-g-nw',
      toneHz: 659.25, // E5
      pan: -0.7,
      keys: ['q', 'Q', '7'],
      mouseButton: null,
    },
    {
      id: 'gridN',
      glyph: 'W',
      name: 'top centre',
      colorVar: '--sym-g-n',
      toneHz: 783.99, // G5
      pan: 0,
      keys: ['w', 'W', '8'],
      mouseButton: null,
    },
    {
      id: 'gridNE',
      glyph: 'E',
      name: 'top right',
      colorVar: '--sym-g-ne',
      toneHz: 987.77, // B5
      pan: 0.7,
      keys: ['e', 'E', '9'],
      mouseButton: null,
    },
    {
      id: 'gridW',
      glyph: 'A',
      name: 'middle left',
      colorVar: '--sym-g-w',
      toneHz: 329.63, // E4
      pan: -0.7,
      keys: ['a', 'A', '4'],
      mouseButton: null,
    },
    {
      id: 'gridC',
      glyph: 'S',
      name: 'centre',
      colorVar: '--sym-g-c',
      toneHz: 392.0, // G4
      pan: 0,
      keys: ['s', 'S', '5'],
      mouseButton: null,
    },
    {
      id: 'gridE',
      glyph: 'D',
      name: 'middle right',
      colorVar: '--sym-g-e',
      toneHz: 493.88, // B4
      pan: 0.7,
      keys: ['d', 'D', '6'],
      mouseButton: null,
    },
    {
      id: 'gridSW',
      glyph: 'Z',
      name: 'bottom left',
      colorVar: '--sym-g-sw',
      toneHz: 164.81, // E3
      pan: -0.7,
      keys: ['z', 'Z', '1'],
      mouseButton: null,
    },
    {
      id: 'gridS',
      glyph: 'X',
      name: 'bottom centre',
      colorVar: '--sym-g-s',
      toneHz: 196.0, // G3
      pan: 0,
      keys: ['x', 'X', '2'],
      mouseButton: null,
    },
    {
      id: 'gridSE',
      glyph: 'C',
      name: 'bottom right',
      colorVar: '--sym-g-se',
      toneHz: 246.94, // B3
      pan: 0.7,
      keys: ['c', 'C', '3'],
      mouseButton: null,
    },
  ],
}

/**
 * Pi: recite the digits.
 *
 * Every other mode invents a new pattern each run. This one never changes —
 * round N is the first N digits of pi — so the thing being trained is
 * knowledge of pi itself, and progress carries from one run to the next.
 * Playback still runs, so a player who does not know pi can learn it here
 * rather than being locked out.
 *
 * Digits sit on a phone keypad and sound a C major pentatonic, low to high.
 * Because the scale has no dissonant interval, the opening plays as an
 * actual melody rather than as noise: 3 . 1 4 1 5 9 has a tune.
 */
const PI_TONES: readonly number[] = [
  261.63, // 0  C4
  293.66, // 1  D4
  329.63, // 2  E4
  392.0, // 3  G4
  440.0, // 4  A4
  523.25, // 5  C5
  587.33, // 6  D5
  659.25, // 7  E5
  783.99, // 8  G5
  880.0, // 9  A5
]

/** Keypad columns, for stereo placement: 1/4/7 left, 2/5/8/0 centre, 3/6/9 right. */
const PI_PAN: readonly number[] = [0, -0.6, 0, 0.6, -0.6, 0, 0.6, -0.6, 0, 0.6]

const PI_SYMBOL_IDS: readonly SymbolId[] = [
  'd0',
  'd1',
  'd2',
  'd3',
  'd4',
  'd5',
  'd6',
  'd7',
  'd8',
  'd9',
]

const PI: ModeDef = {
  id: 'pi',
  name: 'Pi',
  tagline: 'The digits of \u03c0, in order. Everyone knows the first two.',
  layout: 'keypad',
  ambientRootHz: 65.41, // C2 — under the C pentatonic the digits are tuned to
  readout: true,
  fixedSequence: PI_DIGITS.map((digit) => PI_SYMBOL_IDS[Number(digit)]),
  symbols: PI_SYMBOL_IDS.map((id, digit) => ({
    id,
    glyph: String(digit),
    name: `digit ${digit}`,
    colorVar: `--sym-d${digit}`,
    toneHz: PI_TONES[digit],
    pan: PI_PAN[digit],
    // The number row and the numpad both report these.
    keys: [String(digit)],
    mouseButton: null,
  })),
}

export const MODES: readonly ModeDef[] = [ARROWS, CLICKS, GRID, PI]

export function getMode(id: ModeId): ModeDef {
  const mode = MODES.find((m) => m.id === id)
  if (!mode) throw new Error(`unknown mode: ${id}`)
  return mode
}

export function getSymbol(mode: ModeDef, id: SymbolId): SymbolDef {
  const symbol = mode.symbols.find((s) => s.id === id)
  if (!symbol) throw new Error(`symbol ${id} is not part of mode ${mode.id}`)
  return symbol
}

/** Resolve a keydown to a symbol, or null if the key means nothing here. */
export function symbolForKey(mode: ModeDef, key: string): SymbolDef | null {
  return mode.symbols.find((s) => s.keys.includes(key)) ?? null
}

/** Resolve a mousedown button to a symbol, or null if the mode ignores it. */
export function symbolForButton(
  mode: ModeDef,
  button: number,
): SymbolDef | null {
  return mode.symbols.find((s) => s.mouseButton === button) ?? null
}

/* Rules -------------------------------------------------------------------
 * Tunables that aren't timing. Same principle: one place, never inlined.
 */

export const RULES = {
  /** Wrong answers a run starts with. The next one ends it. */
  lives: 3,
  /**
   * Clear a round that is a multiple of this and the run gains a life, with
   * no ceiling. At round 100 — the first one — a run has already survived
   * 5,050 correct inputs, so this is a reward for the mythical, not a top-up.
   */
  freeLifeEveryRounds: 100,
} as const

/* Timing ------------------------------------------------------------------
 * Every duration in the game lives here — never inline one at a call site.
 */

export const TIMING = {
  /** Beat before a round's first flash, so the round change registers. */
  playbackLeadInMs: 420,
  /** SPEC: the next sequence starts within ~600ms. No countdown. */
  nextRoundDelayMs: 600,
  /** Feedback flash for the player's own input. */
  inputFlashMs: 150,
  /** Fail cue plays before the gameover screen appears. */
  failCueMs: 850,
  /**
   * The level-up celebration. Fits inside the runway the engine already
   * leaves — the next round starts at `nextRoundDelayMs` and its first flash
   * only lands `playbackLeadInMs` after that, so a cue up to ~1020ms is over
   * before the player has to be watching the pads again. It delays nothing:
   * invariant 5 still holds, because this is an overlay, not a countdown.
   */
  levelUpCueMs: 950,
  /** Playback flash curve: clamp(520 - 25 * (round - 1), 180, 520). */
  flashMaxMs: 520,
  flashMinMs: 180,
  flashDecayMs: 25,
  /** Gap between flashes, as a fraction of the flash itself. */
  gapRatio: 0.35,
} as const

/* Scoring -----------------------------------------------------------------
 * Points reward solving a round quickly. See game/scoring.ts for the shape.
 */

export const SCORING = {
  /** Points a round is worth before the speed multiplier. */
  pointsPerRound: 100,
  /** Reacting at this speed scores exactly 1x. */
  speedTargetMs: 600,
  /** Bounds on the speed multiplier, so no single round dwarfs a run. */
  speedMin: 0.5,
  speedMax: 3,
  /** Completing a genome pays this, times the tier completed. */
  evolutionBonus: 1000,
} as const

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** How long each symbol stays lit during playback in this round. */
export function flashMsForRound(round: number): number {
  const raw = TIMING.flashMaxMs - TIMING.flashDecayMs * (round - 1)
  return clamp(raw, TIMING.flashMinMs, TIMING.flashMaxMs)
}

/** Dark gap between playback flashes. Keeps repeated symbols distinct. */
export function gapMsForRound(round: number): number {
  return Math.round(flashMsForRound(round) * TIMING.gapRatio)
}

/**
 * Base pairs banked after clearing `rounds` rounds — the triangular number,
 * since round N costs N correct inputs. The evolution ladder is built on it.
 */
export function basePairsAfterRound(rounds: number): number {
  return (rounds * (rounds + 1)) / 2
}
