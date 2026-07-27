/**
 * Screens: menu, game, gameover.
 *
 * Screens render and report intent; they hold no game rules. Every screen
 * is operable with the keyboard alone and with the mouse alone.
 */

import { MODES, type ModeDef, type SymbolId } from '../game/modes.ts'
import type { RunStats } from '../game/engine.ts'
import { createBoard, type Board } from './board.ts'

export interface Screen {
  readonly element: HTMLElement
  destroy(): void
}

/* Menu -------------------------------------------------------------------- */

export interface MenuScreenOptions {
  readonly onPick: (mode: ModeDef) => void
}

export function createMenuScreen({ onPick }: MenuScreenOptions): Screen {
  const element = document.createElement('section')
  element.className = 'screen screen--menu'

  const title = document.createElement('h1')
  title.className = 'wordmark'
  title.innerHTML = 'tang<em>e</em>nt'

  const subtitle = document.createElement('p')
  subtitle.className = 'subtitle'
  subtitle.textContent =
    'Watch the sequence. Repeat it. It grows by one every level.'

  const list = document.createElement('div')
  list.className = 'mode-list'

  const buttons = MODES.map((mode, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'mode-card'
    button.dataset.mode = mode.id

    const number = document.createElement('span')
    number.className = 'mode-card__index'
    number.textContent = String(index + 1)

    const name = document.createElement('span')
    name.className = 'mode-card__name'
    name.textContent = mode.name

    const tagline = document.createElement('span')
    tagline.className = 'mode-card__tagline'
    tagline.textContent = mode.tagline

    button.append(number, name, tagline)
    button.addEventListener('click', () => onPick(mode))
    list.append(button)
    return button
  })

  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.innerHTML =
    'Move with <kbd>↑</kbd><kbd>↓</kbd>, pick with <kbd>enter</kbd> — or just click.'

  element.append(title, subtitle, list, hint)

  // Roving focus so arrow keys work as well as tab.
  function onKeyDown(event: KeyboardEvent): void {
    const digit = Number(event.key)
    if (Number.isInteger(digit) && digit >= 1 && digit <= MODES.length) {
      event.preventDefault()
      onPick(MODES[digit - 1])
      return
    }

    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0
    if (step === 0) return
    // Arrow keys scroll the page otherwise.
    event.preventDefault()
    const active = buttons.findIndex((b) => b === document.activeElement)
    const next = (Math.max(active, 0) + step + buttons.length) % buttons.length
    buttons[next].focus()
  }

  window.addEventListener('keydown', onKeyDown)
  queueMicrotask(() => buttons[0]?.focus())

  return {
    element,
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      element.remove()
    },
  }
}

/* Game -------------------------------------------------------------------- */

export type StatusTone = 'watch' | 'go' | 'good' | 'bad' | 'paused'

export interface GameScreen extends Screen {
  readonly board: Board
  setLevel(level: number): void
  setStatus(text: string, tone: StatusTone): void
  setProgress(done: number, total: number): void
  setLives(left: number, total: number): void
  shake(): void
}

export interface GameScreenOptions {
  readonly mode: ModeDef
  readonly onInput: (symbol: SymbolId) => void
  readonly onExit: () => void
}

export function createGameScreen({
  mode,
  onInput,
  onExit,
}: GameScreenOptions): GameScreen {
  const element = document.createElement('section')
  element.className = 'screen screen--game'

  const header = document.createElement('header')
  header.className = 'hud'

  const modeTag = document.createElement('span')
  modeTag.className = 'hud__mode'
  modeTag.textContent = mode.name

  const level = document.createElement('p')
  level.className = 'hud__level'

  const status = document.createElement('p')
  status.className = 'hud__status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const lives = document.createElement('p')
  lives.className = 'lives'

  header.append(modeTag, level, lives, status)

  const progress = document.createElement('div')
  progress.className = 'progress'
  progress.setAttribute('aria-hidden', 'true')

  // The whole screen is the play area, not just the pad — a click that lands
  // slightly off a pad in clicks mode should still count.
  const board = createBoard({ mode, onInput, surface: element })

  const footer = document.createElement('footer')
  footer.className = 'hint'
  footer.innerHTML = 'Give up with <kbd>esc</kbd>'

  const quit = document.createElement('button')
  quit.type = 'button'
  quit.className = 'btn btn--ghost'
  quit.dataset.noInput = ''
  quit.textContent = 'Menu'
  quit.addEventListener('click', onExit)

  element.append(header, board.element, progress, quit, footer)

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onExit()
  }

  window.addEventListener('keydown', onKeyDown)

  return {
    element,
    board,

    setLevel(value) {
      level.textContent = `Level ${value}`
    },

    setStatus(text, tone) {
      status.textContent = text
      status.dataset.tone = tone
    },

    setProgress(done, total) {
      progress.replaceChildren()
      for (let i = 0; i < total; i += 1) {
        const tick = document.createElement('span')
        tick.className = i < done ? 'progress__tick is-done' : 'progress__tick'
        progress.append(tick)
      }
    },

    setLives(left, total) {
      lives.replaceChildren()
      lives.setAttribute(
        'aria-label',
        `${left} of ${total} ${total === 1 ? 'life' : 'lives'} left`,
      )
      for (let i = 0; i < total; i += 1) {
        const pip = document.createElement('span')
        pip.className = i < left ? 'lives__pip' : 'lives__pip is-spent'
        pip.textContent = '●'
        lives.append(pip)
      }
    },

    shake() {
      element.classList.remove('is-shaking')
      void element.offsetWidth
      element.classList.add('is-shaking')
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      board.destroy()
      element.remove()
    },
  }
}

/* Game over --------------------------------------------------------------- */

/** A lone modifier press shouldn't count as the one input that retries. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

export interface GameOverScreenOptions {
  readonly mode: ModeDef
  readonly stats: RunStats
  readonly onRetry: () => void
  readonly onMenu: () => void
}

export function createGameOverScreen({
  mode,
  stats,
  onRetry,
  onMenu,
}: GameOverScreenOptions): Screen {
  const element = document.createElement('section')
  element.className = 'screen screen--over'

  const heading = document.createElement('h2')
  heading.className = 'over__heading'
  heading.textContent = stats.level === 0 ? 'Out of lives' : 'Run over'

  const score = document.createElement('p')
  score.className = 'over__score'
  score.innerHTML =
    stats.level === 0
      ? 'No levels cleared'
      : `Level <strong>${stats.level}</strong>`

  const modeTag = document.createElement('p')
  modeTag.className = 'over__mode'
  modeTag.textContent = `${mode.name} mode`

  const statList = document.createElement('dl')
  statList.className = 'stats'
  for (const [label, value] of statRows(stats)) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    statList.append(dt, dd)
  }

  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'btn btn--retry'
  retry.textContent = 'Retry'
  retry.addEventListener('click', onRetry)

  const menu = document.createElement('button')
  menu.type = 'button'
  menu.className = 'btn btn--ghost'
  menu.dataset.noRetry = ''
  menu.textContent = 'Menu'
  menu.addEventListener('click', onMenu)

  const actions = document.createElement('div')
  actions.className = 'over__actions'
  actions.append(retry, menu)

  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.innerHTML = 'Any key or click to retry · <kbd>esc</kbd> for the menu'

  element.append(heading, score, modeTag, statList, actions, hint)

  // Retry must cost exactly one input, whichever device the player is on.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Tab' || MODIFIER_KEYS.has(event.key)) return
    event.preventDefault()
    if (event.repeat) return
    if (event.key === 'Escape') onMenu()
    else onRetry()
  }

  function onMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-no-retry]')) return
    event.preventDefault()
    onRetry()
  }

  function onContextMenu(event: MouseEvent): void {
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  element.addEventListener('mousedown', onMouseDown)
  element.addEventListener('contextmenu', onContextMenu)
  queueMicrotask(() => retry.focus())

  return {
    element,
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      element.removeEventListener('mousedown', onMouseDown)
      element.removeEventListener('contextmenu', onContextMenu)
      element.remove()
    },
  }
}

function statRows(stats: RunStats): ReadonlyArray<readonly [string, string]> {
  if (stats.totalInputs === 0) return [['Inputs', '0']]
  return [
    ['Avg reaction', `${stats.avgReactionMs} ms`],
    ['Fastest', `${stats.fastestInputMs} ms`],
    ['Inputs', String(stats.totalInputs)],
    ['Misses', String(stats.mistakes)],
    ['Run time', `${(stats.runDurationMs / 1000).toFixed(1)} s`],
  ]
}
