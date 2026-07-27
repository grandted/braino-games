/**
 * The pad: renders a mode's symbols, animates flashes and pressed states,
 * and owns every input listener in the game.
 *
 * Input traps handled here:
 *   - arrow keys are preventDefault'd (otherwise the page scrolls)
 *   - contextmenu is preventDefault'd over the play area
 *   - `event.repeat` keydowns are ignored (key held down)
 *   - pointers fire on `pointerdown`, never `click` — `click` can't tell the
 *     buttons apart and feels laggy
 *   - a touch is not a mouse: clicks mode reads the mouse *button*, but a
 *     touchscreen has no right button, so a tap reads which *pad* it landed on
 */

import {
  TIMING,
  symbolForButton,
  symbolForKey,
  type ModeDef,
  type SymbolDef,
  type SymbolId,
} from '../game/modes.ts'

export interface Board {
  readonly element: HTMLElement
  /** Light a pad for `durationMs` (playback). */
  flash(symbol: SymbolId, durationMs: number): void
  /** Short confirm flash for the player's own input. */
  pressed(symbol: SymbolId): void
  /** Drop every lit pad immediately. */
  clear(): void
  /** Locked = playback is running; input is swallowed and visibly so. */
  setLocked(locked: boolean): void
  /** Fail cue on the pad the player should have hit. */
  showMiss(expected: SymbolId, received: SymbolId): void
  destroy(): void
}

export interface BoardOptions {
  readonly mode: ModeDef
  readonly onInput: (symbol: SymbolId) => void
  /**
   * The play area for mouse purposes — defaults to the pad itself. The game
   * screen passes its whole root so a click that lands just off a pad still
   * counts, and so no right-click anywhere in the round opens a browser menu.
   * Buttons inside it stay clickable.
   */
  readonly surface?: HTMLElement
}

export interface PointerInput {
  /** `PointerEvent.pointerType`: 'mouse', 'touch' or 'pen'. */
  readonly pointerType: string
  /** `PointerEvent.button`. Meaningless for touch, which always reports 0. */
  readonly button: number
  /** The pad the pointer landed on, or null for bare play area. */
  readonly onPad: SymbolId | null
}

/**
 * Which symbol a pointer press means, or null for "not an input".
 *
 * Pure and exported so the rule can be tested directly — it's the one piece of
 * input handling where mouse and touch genuinely disagree:
 *
 *   - mouse, clicks mode  → the *button* is the symbol, anywhere in the area
 *   - mouse, arrows mode  → left button on a pad
 *   - touch, either mode  → whichever *pad* was tapped, because a touchscreen
 *                           has no second button to read
 */
export function resolvePointer(
  mode: ModeDef,
  { pointerType, button, onPad }: PointerInput,
): SymbolId | null {
  if (pointerType === 'mouse') {
    const byButton = symbolForButton(mode, button)
    if (byButton) return byButton.id
    // Middle/back/forward are never inputs.
    if (button !== 0) return null
  }
  return onPad
}

export function createBoard({ mode, onInput, surface }: BoardOptions): Board {
  const element = document.createElement('div')
  element.className = `board board--${mode.layout}`
  element.dataset.mode = mode.id

  const playArea = surface ?? element

  const pads = new Map<SymbolId, HTMLElement>()
  const timers = new Map<SymbolId, number>()

  for (const symbol of mode.symbols) {
    const pad = createPad(mode, symbol)
    pads.set(symbol.id, pad)
    element.append(pad)
  }

  /* Input --------------------------------------------------------------- */

  function onKeyDown(event: KeyboardEvent): void {
    const symbol = symbolForKey(mode, event.key)
    if (!symbol) return
    // Arrow keys scroll the page unless we say otherwise — and we do this
    // even while locked, or scrolling resumes during playback.
    event.preventDefault()
    if (event.repeat) return
    onInput(symbol.id)
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null
    // Buttons activate themselves — a press on one is never a game input.
    if (target?.closest('button')) return

    const pad = target?.closest('.pad')
    const onPad =
      pad instanceof HTMLElement ? (pad.dataset.symbol as SymbolId) : null

    const symbol = resolvePointer(mode, {
      pointerType: event.pointerType,
      button: event.button,
      onPad,
    })
    if (!symbol) return

    event.preventDefault()
    onInput(symbol)
  }

  function onContextMenu(event: MouseEvent): void {
    // Right-click is a game input in clicks mode; never a browser menu.
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  playArea.addEventListener('pointerdown', onPointerDown)
  playArea.addEventListener('contextmenu', onContextMenu)

  /* Rendering ------------------------------------------------------------ */

  function lift(id: SymbolId): void {
    const existing = timers.get(id)
    if (existing !== undefined) {
      clearTimeout(existing)
      timers.delete(id)
    }
    pads.get(id)?.classList.remove('pad--lit', 'pad--playback', 'pad--pressed')
  }

  function light(id: SymbolId, durationMs: number, className: string): void {
    const pad = pads.get(id)
    if (!pad) return
    lift(id)
    // Restart the animation explicitly: two flashes of the same symbol in a
    // row must read as two, not one long one.
    void pad.offsetWidth
    pad.classList.add('pad--lit', className)
    timers.set(
      id,
      window.setTimeout(() => {
        pad.classList.remove('pad--lit', className)
        timers.delete(id)
      }, durationMs),
    )
  }

  return {
    element,

    flash(symbol, durationMs) {
      light(symbol, durationMs, 'pad--playback')
    },

    pressed(symbol) {
      light(symbol, TIMING.inputFlashMs, 'pad--pressed')
    },

    clear() {
      for (const id of pads.keys()) lift(id)
      for (const pad of pads.values()) {
        pad.classList.remove('pad--playback', 'pad--pressed', 'pad--miss')
      }
    },

    setLocked(locked) {
      element.classList.toggle('board--locked', locked)
    },

    showMiss(expected, received) {
      const target = pads.get(expected)
      target?.classList.add('pad--miss')
      if (received !== expected) pads.get(received)?.classList.add('pad--miss')
      window.setTimeout(() => {
        target?.classList.remove('pad--miss')
        pads.get(received)?.classList.remove('pad--miss')
      }, TIMING.failCueMs)
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      playArea.removeEventListener('pointerdown', onPointerDown)
      playArea.removeEventListener('contextmenu', onContextMenu)
      for (const id of timers.values()) clearTimeout(id)
      timers.clear()
      element.remove()
    },
  }
}

function createPad(mode: ModeDef, symbol: SymbolDef): HTMLElement {
  const pad = document.createElement('div')
  pad.className = `pad pad--${symbol.id}`
  pad.dataset.symbol = symbol.id
  pad.style.setProperty('--sym', `var(${symbol.colorVar})`)
  pad.setAttribute('role', 'img')
  pad.setAttribute('aria-label', symbol.name)

  const glyph = document.createElement('span')
  glyph.className = 'pad__glyph'
  glyph.textContent = symbol.glyph
  pad.append(glyph)

  if (mode.layout === 'split') {
    const label = document.createElement('span')
    label.className = 'pad__label'
    label.textContent = symbol.name
    pad.append(label)
  }

  return pad
}
