/**
 * Generated tones — no asset files.
 *
 * Sound is not decoration here: pairing a pitch with each symbol is part of
 * what makes a sequence stick, so the tones follow the flash exactly. One
 * pitch per symbol, held for the flash duration.
 *
 * Browsers won't let an AudioContext start outside a user gesture, so the
 * context is created lazily on the first `resume()` — which the app calls
 * from the click or keypress that picks a mode.
 */

import type { SymbolDef } from '../game/modes.ts'

const STORAGE_KEY = 'tangent:muted'

/** Kept low: six pads flashing at speed gets fatiguing fast. */
const MASTER_GAIN = 0.16
const ATTACK_S = 0.008
const RELEASE_S = 0.07

/**
 * Cue shapes. Game timing lives in `game/modes.ts`; these are the audio
 * envelopes, which belong to the sound rather than to the rules.
 */
const CUES = {
  clearFirstHz: 659.25, // E5
  clearSecondHz: 987.77, // B5
  clearNoteMs: 90,
  clearSecondMs: 130,
  clearGapS: 0.1,
  missFromHz: 196,
  missToHz: 65,
  missMs: 420,
  /** Evolution fanfare: a rising major arpeggio, one note per step. */
  evolveHz: [523.25, 659.25, 783.99, 1046.5], // C5 E5 G5 C6
  evolveNoteMs: 150,
  evolveStepS: 0.075,
} as const

export interface Tones {
  readonly muted: boolean
  /** Returns the new muted state. */
  toggleMute(): boolean
  /** Open or wake the audio context. Must be called inside a user gesture. */
  resume(): void
  /** A symbol's pitch, held for `durationMs`. */
  play(symbol: SymbolDef, durationMs: number): void
  /** Two rising blips after a cleared round. */
  roundClear(): void
  /** Rising arpeggio when a genome completes and the run evolves. */
  evolve(): void
  /** Descending buzz for a spent life. */
  miss(): void
  destroy(): void
}

/**
 * One instance per app, not per run: browsers cap how many AudioContexts a
 * page may hold, and retrying a run repeatedly would walk straight into it.
 */
export function createTones(): Tones {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let muted = readMuted()

  function ensureContext(): AudioContext | null {
    if (context) return context
    const Ctor = window.AudioContext
    if (!Ctor) return null
    context = new Ctor()
    master = context.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(context.destination)
    return context
  }

  /** One enveloped oscillator. Envelopes matter — raw gates click audibly. */
  function tone(
    hz: number,
    durationMs: number,
    type: OscillatorType = 'triangle',
    startOffsetS = 0,
    glideToHz?: number,
  ): void {
    if (muted) return
    const ctx = ensureContext()
    if (!ctx || !master || ctx.state === 'closed') return

    const startAt = ctx.currentTime + startOffsetS
    const holdS = Math.max(durationMs / 1000, 0.05)
    const endAt = startAt + holdS

    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(hz, startAt)
    if (glideToHz !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(glideToHz, endAt)
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(1, startAt + ATTACK_S)
    gain.gain.setValueAtTime(1, Math.max(endAt - RELEASE_S, startAt + ATTACK_S))
    // Exponential to a floor, not to zero — zero is undefined for this ramp.
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

    osc.connect(gain)
    gain.connect(master)
    osc.start(startAt)
    osc.stop(endAt + 0.02)
    // Let the node graph go without waiting on GC.
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }

  return {
    get muted() {
      return muted
    },

    toggleMute() {
      muted = !muted
      writeMuted(muted)
      return muted
    },

    resume() {
      const ctx = ensureContext()
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    },

    play(symbol, durationMs) {
      tone(symbol.toneHz, durationMs)
    },

    roundClear() {
      tone(CUES.clearFirstHz, CUES.clearNoteMs, 'sine')
      tone(CUES.clearSecondHz, CUES.clearSecondMs, 'sine', CUES.clearGapS)
    },

    evolve() {
      CUES.evolveHz.forEach((hz, step) => {
        tone(hz, CUES.evolveNoteMs, 'triangle', step * CUES.evolveStepS)
      })
    },

    miss() {
      tone(CUES.missFromHz, CUES.missMs, 'sawtooth', 0, CUES.missToHz)
    },

    destroy() {
      const ctx = context
      context = null
      master = null
      void ctx?.close()
    },
  }
}

/** The mute toggle persists across sessions. */
function readMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Private mode and blocked storage both throw; sound on is a fine default.
    return false
  }
}

function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // Nothing to do — the toggle still works for this session.
  }
}
