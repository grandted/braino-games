/**
 * Generated audio — no asset files, no libraries.
 *
 * Sound is not decoration here: pairing a pitch *and* a stereo position with
 * each symbol is part of what makes a pattern stick, so the tones follow the
 * flash exactly and the left symbol genuinely comes from the left.
 *
 * Signal chain:
 *
 *   voice → panner ─┬─────────────── dry ──┐
 *                   └─ send → convolver ───┤→ master → compressor → out
 *   ambient bed ────────────────── duck ───┘
 *
 * The reverb impulse is synthesised at startup (decaying stereo noise), the
 * compressor keeps a dense round from clipping, and the bed ducks under
 * playback so the pattern always sits on top of the mix.
 *
 * Browsers won't let an AudioContext start outside a user gesture, so the
 * context is created lazily on the first `resume()` — which the app calls
 * from the click or keypress that picks a mode.
 */

import type { ModeDef, SymbolDef } from '../game/modes.ts'

const STORAGE_KEY = 'tangent:muted'

/** Kept low: a dense round is a lot of simultaneous voices. */
const MASTER_GAIN = 0.5
const REVERB_SECONDS = 1.9
const REVERB_WET = 0.26

const VOICE = {
  /** Slight detune between the two oscillators — width without chorus. */
  detuneCents: 7,
  attackS: 0.006,
  releaseS: 0.13,
  /** Filter sweeps down over the note, which is what gives it a pluck. */
  filterOpenHz: 5200,
  filterCloseHz: 900,
  filterQ: 1.1,
} as const

const BED = {
  gain: 0.055,
  /** Pulled down while the pattern is playing so the tones stay on top. */
  duckedGain: 0.018,
  /** Brightens as the run climbs the ladder — a slow sense of ascent. */
  baseCutoffHz: 260,
  cutoffPerLevelHz: 90,
  maxCutoffHz: 1400,
  glideS: 1.4,
} as const

const CUES = {
  clearNotes: [659.25, 987.77], // E5, B5
  clearNoteMs: 90,
  clearGapS: 0.085,
  /** Every fourth round resolves an octave up — a small "still going" nod. */
  clearAccentHz: 1318.5,
  evolveNotes: [261.63, 392.0, 523.25, 659.25, 783.99], // C E G C E
  evolveNoteMs: 420,
  evolveStepS: 0.075,
  missFromHz: 196,
  missToHz: 62,
  missMs: 460,
  freeLifeNotes: [523.25, 659.25, 783.99, 1046.5, 1318.5],
  freeLifeNoteMs: 260,
  freeLifeStepS: 0.06,
  overNotes: [392.0, 329.63, 261.63], // a resigned descent
  overNoteMs: 520,
  overStepS: 0.16,
} as const

export interface Tones {
  readonly muted: boolean
  /** Returns the new muted state. */
  toggleMute(): boolean
  /** Open or wake the audio context. Must be called inside a user gesture. */
  resume(): void
  /** A symbol's pitch and stereo position, held for `durationMs`. */
  play(symbol: SymbolDef, durationMs: number): void
  /** Cleared a round. Every fourth one gets an extra note on top. */
  roundClear(round: number): void
  /** A genome completed. */
  evolve(): void
  /** A life spent. */
  miss(): void
  /** A life earned — only ever heard at round 100. */
  freeLife(): void
  /** The run is over. */
  gameOver(): void
  /** Start the harmonic bed under a run. */
  startAmbience(mode: ModeDef): void
  /** Brighten the bed as the run climbs. */
  setAmbienceLevel(level: number): void
  /** Pull the bed down under playback so the pattern stays on top. */
  duck(ducked: boolean): void
  stopAmbience(): void
  destroy(): void
}

/**
 * One instance per app, not per run: browsers cap how many AudioContexts a
 * page may hold, and retrying a run repeatedly would walk straight into it.
 */
export function createTones(): Tones {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let dry: GainNode | null = null
  let wet: GainNode | null = null
  let reverb: ConvolverNode | null = null
  let muted = readMuted()

  /** The ambient bed, alive only for the length of a run. */
  let bed: {
    voices: OscillatorNode[]
    gain: GainNode
    filter: BiquadFilterNode
  } | null = null

  function ensureContext(): AudioContext | null {
    if (context) return context
    const Ctor = window.AudioContext
    if (!Ctor) return null

    context = new Ctor()

    // Catches the peaks when a fast player stacks voices, so the mix stays
    // loud without ever clipping.
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.knee.value = 22
    compressor.ratio.value = 3.5
    compressor.attack.value = 0.004
    compressor.release.value = 0.18

    master = context.createGain()
    master.gain.value = MASTER_GAIN

    reverb = context.createConvolver()
    reverb.buffer = createImpulse(context, REVERB_SECONDS)

    wet = context.createGain()
    wet.gain.value = REVERB_WET
    dry = context.createGain()
    dry.gain.value = 1

    reverb.connect(wet)
    wet.connect(master)
    dry.connect(master)
    master.connect(compressor)
    compressor.connect(context.destination)

    return context
  }

  /** Route a source into both the dry path and the reverb send. */
  function send(node: AudioNode): void {
    if (dry) node.connect(dry)
    if (reverb) node.connect(reverb)
  }

  /**
   * One enveloped voice: two detuned oscillators through a closing filter.
   * Envelopes matter — raw gates click audibly, and a filter that closes over
   * the note is the difference between a beep and an instrument.
   */
  function voice(
    hz: number,
    durationMs: number,
    options: {
      type?: OscillatorType
      startOffsetS?: number
      glideToHz?: number
      pan?: number
      level?: number
    } = {},
  ): void {
    if (muted) return
    const ctx = ensureContext()
    if (!ctx || ctx.state === 'closed') return

    const {
      type = 'triangle',
      startOffsetS = 0,
      glideToHz,
      pan = 0,
      level = 1,
    } = options

    const startAt = ctx.currentTime + startOffsetS
    const holdS = Math.max(durationMs / 1000, 0.05)
    const endAt = startAt + holdS

    const panner = ctx.createStereoPanner()
    panner.pan.setValueAtTime(pan, startAt)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(level, startAt + VOICE.attackS)
    gain.gain.setValueAtTime(
      level,
      Math.max(endAt - VOICE.releaseS, startAt + VOICE.attackS),
    )
    // Exponential to a floor, not to zero — zero is undefined for this ramp.
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = VOICE.filterQ
    filter.frequency.setValueAtTime(VOICE.filterOpenHz, startAt)
    filter.frequency.exponentialRampToValueAtTime(VOICE.filterCloseHz, endAt)

    const oscillators: OscillatorNode[] = []
    for (const detune of [-VOICE.detuneCents, VOICE.detuneCents]) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.detune.setValueAtTime(detune, startAt)
      osc.frequency.setValueAtTime(hz, startAt)
      if (glideToHz !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(glideToHz, endAt)
      }
      osc.connect(filter)
      osc.start(startAt)
      osc.stop(endAt + 0.03)
      oscillators.push(osc)
    }

    filter.connect(gain)
    gain.connect(panner)
    send(panner)

    // Let the node graph go without waiting on GC.
    oscillators[oscillators.length - 1].onended = () => {
      filter.disconnect()
      gain.disconnect()
      panner.disconnect()
      for (const osc of oscillators) osc.disconnect()
    }
  }

  /** A short filtered noise burst — the transient a pure tone can't give. */
  function noise(durationMs: number, level: number, cutoffHz: number): void {
    if (muted) return
    const ctx = ensureContext()
    if (!ctx || ctx.state === 'closed') return

    const seconds = Math.max(durationMs / 1000, 0.03)
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length)
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoffHz

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(level, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds)

    source.connect(filter)
    filter.connect(gain)
    send(gain)
    source.start()
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
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
      if (bed) {
        const ctx = context
        if (ctx) {
          bed.gain.gain.cancelScheduledValues(ctx.currentTime)
          bed.gain.gain.setTargetAtTime(
            muted ? 0 : BED.gain,
            ctx.currentTime,
            0.05,
          )
        }
      }
      return muted
    },

    resume() {
      const ctx = ensureContext()
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    },

    play(symbol, durationMs) {
      voice(symbol.toneHz, durationMs, { pan: symbol.pan })
    },

    roundClear(round) {
      CUES.clearNotes.forEach((hz, step) => {
        voice(hz, CUES.clearNoteMs, {
          type: 'sine',
          startOffsetS: step * CUES.clearGapS,
          level: 0.7,
        })
      })
      if (round % 4 === 0) {
        voice(CUES.clearAccentHz, CUES.clearNoteMs, {
          type: 'sine',
          startOffsetS: CUES.clearNotes.length * CUES.clearGapS,
          level: 0.5,
        })
      }
    },

    evolve() {
      // A rising chord that keeps ringing under the next round's lead-in.
      CUES.evolveNotes.forEach((hz, step) => {
        voice(hz, CUES.evolveNoteMs, {
          type: 'triangle',
          startOffsetS: step * CUES.evolveStepS,
          level: 0.55,
          pan: step % 2 === 0 ? -0.25 : 0.25,
        })
      })
      noise(220, 0.16, 6000)
    },

    miss() {
      voice(CUES.missFromHz, CUES.missMs, {
        type: 'sawtooth',
        glideToHz: CUES.missToHz,
        level: 0.8,
      })
      noise(140, 0.3, 1800)
    },

    freeLife() {
      CUES.freeLifeNotes.forEach((hz, step) => {
        voice(hz, CUES.freeLifeNoteMs, {
          type: 'sine',
          startOffsetS: step * CUES.freeLifeStepS,
          level: 0.6,
          pan: step % 2 === 0 ? -0.35 : 0.35,
        })
      })
    },

    gameOver() {
      CUES.overNotes.forEach((hz, step) => {
        voice(hz, CUES.overNoteMs, {
          type: 'triangle',
          startOffsetS: step * CUES.overStepS,
          level: 0.5,
        })
      })
    },

    startAmbience(mode) {
      const ctx = ensureContext()
      if (!ctx || bed) return

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = BED.baseCutoffHz
      filter.Q.value = 0.7

      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.gain.setTargetAtTime(muted ? 0 : BED.gain, ctx.currentTime, 0.9)

      // Root, fifth and octave — enough to sit under the symbol pitches
      // without ever implying a chord that fights them.
      const voices = [1, 1.5, 2].map((ratio, index) => {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = mode.ambientRootHz * ratio
        osc.detune.value = index === 1 ? 4 : -4
        osc.connect(filter)
        osc.start()
        return osc
      })

      filter.connect(gain)
      send(gain)
      bed = { voices, gain, filter }
    },

    setAmbienceLevel(level) {
      const ctx = context
      if (!bed || !ctx) return
      const cutoff = Math.min(
        BED.baseCutoffHz + level * BED.cutoffPerLevelHz,
        BED.maxCutoffHz,
      )
      bed.filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, BED.glideS)
    },

    duck(ducked) {
      const ctx = context
      if (!bed || !ctx) return
      bed.gain.gain.setTargetAtTime(
        muted ? 0 : ducked ? BED.duckedGain : BED.gain,
        ctx.currentTime,
        0.18,
      )
    },

    stopAmbience() {
      const ctx = context
      const current = bed
      if (!current || !ctx) return
      bed = null

      current.gain.gain.cancelScheduledValues(ctx.currentTime)
      current.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
      const stopAt = ctx.currentTime + 1.2
      for (const osc of current.voices) osc.stop(stopAt)
      current.voices[current.voices.length - 1].onended = () => {
        for (const osc of current.voices) osc.disconnect()
        current.filter.disconnect()
        current.gain.disconnect()
      }
    },

    destroy() {
      const ctx = context
      context = null
      master = null
      dry = null
      wet = null
      reverb = null
      bed = null
      void ctx?.close()
    },
  }
}

/**
 * A synthetic reverb impulse: decaying stereo noise. Cheaper than shipping an
 * impulse file, and the project has no asset pipeline by design.
 */
function createImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i += 1) {
      // Exponential decay, with a slight pre-delay so early reflections read.
      const decay = (1 - i / length) ** 2.6
      data[i] = (Math.random() * 2 - 1) * decay
    }
  }
  return impulse
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
