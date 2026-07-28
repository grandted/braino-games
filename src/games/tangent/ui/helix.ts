/**
 * The DNA strand — a rotating double helix showing how much of the current
 * organism's genome is solved.
 *
 * Genomes run from 3 base pairs (virus) to eleven thousand (human), so rungs
 * are literal while they can be and proportional after that: below the cap one
 * rung is one base pair, above it each rung is a chunk. A virus really does
 * show three rungs, which is the nicest accident in the whole feature.
 *
 * Rotation is pure CSS on `transform` — one infinite animation per rung, all
 * compositor work, no `requestAnimationFrame`. The playback loop is timing
 * sensitive and nothing here may compete with it.
 *
 * The strand also carries the locked state: it hangs still and dim while the
 * sequence is playing back, and spins up when it is the player's turn.
 */

import { TIMING, getSymbol, type ModeDef, type SymbolId } from '../game/modes.ts'

/** Fallback when the CSS custom property can't be read. */
const DEFAULT_RUNGS = 40
/** A pulse on the newest bond; short enough not to blur into the next input. */
const BOND_PULSE_MS = 260

export interface Helix {
  readonly element: HTMLElement
  /** Redraw for the current genome. Rebuilds only when the rung count moves. */
  setGenome(bonded: number, genome: number, hue: number): void
  /** True during the input phase: the strand spins and brightens. */
  setLive(live: boolean): void
  /** Flash the leading rung in the colour of the symbol that just bonded. */
  bond(symbol: SymbolId): void
  /** Genome complete — sweep the strand before the next one unfurls. */
  evolve(): void
  /** Past the named organisms the helix stops behaving. */
  setAnomaly(anomaly: boolean): void
  destroy(): void
}

/**
 * How many rungs are lit for a given genome fill. Pure and exported so the
 * one rule that matters can be tested without a DOM: **a strand that looks
 * complete always is.** With genomes up to eleven thousand base pairs mapped
 * onto forty rungs, rounding would otherwise light the final rung early and
 * promise an evolution that hasn't happened.
 */
export function bondedRungs(
  bonded: number,
  genome: number,
  rungs: number,
): number {
  if (genome <= 0 || rungs <= 0) return 0
  if (bonded >= genome) return rungs
  const filled = Math.floor((Math.max(0, bonded) / genome) * rungs)
  return Math.max(0, Math.min(rungs - 1, filled))
}

export function createHelix(mode: ModeDef): Helix {
  const element = document.createElement('div')
  element.className = 'helix'
  // Decorative: the HUD already announces level and genome progress in text.
  element.setAttribute('aria-hidden', 'true')

  const strand = document.createElement('div')
  strand.className = 'helix__strand'
  element.append(strand)

  let rungs: HTMLElement[] = []
  /** How many rungs are currently lit. */
  let lit = 0
  const timers = new Set<number>()

  /** How many rungs fit. Set per breakpoint in CSS, read once per rebuild. */
  function capacity(): number {
    const raw = getComputedStyle(element).getPropertyValue('--helix-rungs')
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUNGS
  }

  function build(count: number): void {
    strand.replaceChildren()
    rungs = []

    for (let index = 0; index < count; index += 1) {
      const rung = document.createElement('span')
      rung.className = 'helix__rung'
      // Drives this rung's phase in the shared spin animation.
      rung.style.setProperty('--i', String(index))

      const bar = document.createElement('i')
      bar.className = 'helix__bar'
      const front = document.createElement('i')
      front.className = 'helix__node helix__node--front'
      const back = document.createElement('i')
      back.className = 'helix__node helix__node--back'

      rung.append(bar, front, back)
      strand.append(rung)
      rungs.push(rung)
    }

    strand.style.setProperty('--count', String(count))
    lit = 0
  }

  function after(delayMs: number, run: () => void): void {
    const id = window.setTimeout(() => {
      timers.delete(id)
      run()
    }, delayMs)
    timers.add(id)
  }

  return {
    element,

    setGenome(bonded, genome, hue) {
      const wanted = Math.max(1, Math.min(genome, capacity()))
      if (wanted !== rungs.length) build(wanted)

      element.style.setProperty('--helix-hue', String(hue))

      const filled = bondedRungs(bonded, genome, rungs.length)

      for (let index = 0; index < rungs.length; index += 1) {
        rungs[index].classList.toggle('is-bonded', index < filled)
      }
      lit = filled
    },

    setLive(live) {
      element.classList.toggle('is-live', live)
    },

    bond(symbol) {
      // The leading rung — the one the newest base pair landed on.
      const rung = rungs[Math.max(0, lit - 1)]
      if (!rung) return

      // Only the *bonded* rung ever takes a symbol colour. An unbonded rung
      // showing one would be a cheat sheet sitting above the pads.
      rung.style.setProperty('--flash', `var(${getSymbol(mode, symbol).colorVar})`)
      rung.classList.remove('is-fresh')
      void rung.offsetWidth
      rung.classList.add('is-fresh')
      after(BOND_PULSE_MS, () => rung.classList.remove('is-fresh'))
    },

    evolve() {
      element.classList.remove('is-evolving')
      void element.offsetWidth
      element.classList.add('is-evolving')
      after(TIMING.nextRoundDelayMs, () =>
        element.classList.remove('is-evolving'),
      )
    },

    setAnomaly(anomaly) {
      element.classList.toggle('is-anomaly', anomaly)
    },

    destroy() {
      for (const id of timers) clearTimeout(id)
      timers.clear()
      element.remove()
    },
  }
}
