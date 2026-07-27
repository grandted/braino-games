/**
 * Mode definitions and every timing constant in the game.
 *
 * Nothing here touches the DOM. Colours are named as CSS custom properties
 * rather than literals so the palette stays in one place (styles/base.css).
 */

export type SymbolId =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'clickLeft'
  | 'clickRight'

export type ModeId = 'arrows' | 'clicks'

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
  readonly layout: 'cluster' | 'split'
  readonly symbols: readonly SymbolDef[]
}

const ARROWS: ModeDef = {
  id: 'arrows',
  name: 'Arrows',
  tagline: 'Four keys, two bits a step. Gets hard fast.',
  layout: 'cluster',
  symbols: [
    {
      id: 'up',
      glyph: '↑',
      name: 'up',
      colorVar: '--sym-up',
      toneHz: 587.33, // D5
      keys: ['ArrowUp'],
      mouseButton: null,
    },
    {
      id: 'left',
      glyph: '←',
      name: 'left',
      colorVar: '--sym-left',
      toneHz: 392.0, // G4
      keys: ['ArrowLeft'],
      mouseButton: null,
    },
    {
      id: 'down',
      glyph: '↓',
      name: 'down',
      colorVar: '--sym-down',
      toneHz: 329.63, // E4
      keys: ['ArrowDown'],
      mouseButton: null,
    },
    {
      id: 'right',
      glyph: '→',
      name: 'right',
      colorVar: '--sym-right',
      toneHz: 493.88, // B4
      keys: ['ArrowRight'],
      mouseButton: null,
    },
  ],
}

const CLICKS: ModeDef = {
  id: 'clicks',
  name: 'Clicks',
  tagline: 'Two buttons, one bit a step. Longer runs, different hard.',
  layout: 'split',
  symbols: [
    {
      id: 'clickLeft',
      glyph: '◧',
      name: 'left click',
      colorVar: '--sym-click-left',
      toneHz: 440.0, // A4
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
      keys: ['ArrowRight'],
      mouseButton: 2,
    },
  ],
}

export const MODES: readonly ModeDef[] = [ARROWS, CLICKS]

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

/* Timing ------------------------------------------------------------------
 * Every duration in the game lives here — never inline one at a call site.
 */

export const TIMING = {
  /** Beat before a level's first flash, so the level change registers. */
  playbackLeadInMs: 420,
  /** SPEC: the next sequence starts within ~600ms. No countdown. */
  nextLevelDelayMs: 600,
  /** Feedback flash for the player's own input. */
  inputFlashMs: 150,
  /** Fail cue plays before the gameover screen appears. */
  failCueMs: 850,
  /** Playback flash curve: clamp(520 - 25 * (level - 1), 180, 520). */
  flashMaxMs: 520,
  flashMinMs: 180,
  flashDecayMs: 25,
  /** Gap between flashes, as a fraction of the flash itself. */
  gapRatio: 0.35,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** How long each symbol stays lit during playback at this level. */
export function flashMsForLevel(level: number): number {
  const raw = TIMING.flashMaxMs - TIMING.flashDecayMs * (level - 1)
  return clamp(raw, TIMING.flashMinMs, TIMING.flashMaxMs)
}

/** Dark gap between playback flashes. Keeps repeated symbols distinct. */
export function gapMsForLevel(level: number): number {
  return Math.round(flashMsForLevel(level) * TIMING.gapRatio)
}
