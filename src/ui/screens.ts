/**
 * Screens: menu, game, gameover.
 *
 * Screens render and report intent; they hold no game rules. Every screen
 * is operable with the keyboard alone and with the mouse alone.
 */

import { MODES, getMode, type ModeDef, type SymbolId } from '../game/modes.ts'
import type { RunStats } from '../game/engine.ts'
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  absoluteTime,
  isValidNickname,
  labelsFor,
  normaliseNickname,
  readLastNickname,
  relativeTime,
  rememberNickname,
  type Entry,
  type LeaderboardProvider,
} from '../leaderboard/index.ts'
import { createBoard, type Board } from './board.ts'
import type { Tones } from './audio.ts'

export interface Screen {
  readonly element: HTMLElement
  destroy(): void
}

/**
 * Mute toggle. Every screen carries one so the shortcut works wherever the
 * player is, and the state it shows comes straight from `tones`.
 */
function createMuteButton(tones: Tones): {
  element: HTMLButtonElement
  destroy(): void
} {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'btn btn--ghost mute'
  // Not a game input and not a retry — just a toggle.
  element.dataset.noInput = ''
  element.dataset.noRetry = ''

  function render(): void {
    element.textContent = tones.muted ? 'sound off' : 'sound on'
    element.dataset.on = String(!tones.muted)
    element.setAttribute('aria-pressed', String(!tones.muted))
  }

  function toggle(): void {
    tones.toggleMute()
    render()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'm' && event.key !== 'M') return
    event.preventDefault()
    if (event.repeat) return
    toggle()
  }

  render()
  element.addEventListener('click', toggle)
  window.addEventListener('keydown', onKeyDown)

  return {
    element,
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

/* Menu -------------------------------------------------------------------- */

export interface MenuScreenOptions {
  readonly onPick: (mode: ModeDef) => void
  readonly onShowLeaderboard: () => void
  readonly tones: Tones
  readonly leaderboardLabel: string
}

export function createMenuScreen({
  onPick,
  onShowLeaderboard,
  tones,
  leaderboardLabel,
}: MenuScreenOptions): Screen {
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
    'Move with <kbd>↑</kbd><kbd>↓</kbd>, pick with <kbd>enter</kbd> — or just click. ' +
    'Three lives a run. <kbd>m</kbd> mutes.'

  const mute = createMuteButton(tones)

  const board = document.createElement('button')
  board.type = 'button'
  board.className = 'btn btn--ghost'
  board.textContent = leaderboardLabel
  board.addEventListener('click', onShowLeaderboard)

  const controls = document.createElement('div')
  controls.className = 'controls'
  controls.append(board, mute.element)

  element.append(title, subtitle, list, hint, controls)

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
      mute.destroy()
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
  readonly tones: Tones
}

export function createGameScreen({
  mode,
  onInput,
  onExit,
  tones,
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
  footer.innerHTML = 'Give up with <kbd>esc</kbd> · mute with <kbd>m</kbd>'

  const quit = document.createElement('button')
  quit.type = 'button'
  quit.className = 'btn btn--ghost'
  quit.dataset.noInput = ''
  quit.textContent = 'Menu'
  quit.addEventListener('click', onExit)

  const mute = createMuteButton(tones)

  const controls = document.createElement('div')
  controls.className = 'controls'
  controls.append(quit, mute.element)

  element.append(header, board.element, progress, controls, footer)

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
      mute.destroy()
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
  /** `highlight` is the achievedAt of a run just saved, if any. */
  readonly onShowLeaderboard: (highlight?: string) => void
  readonly provider: LeaderboardProvider
  readonly tones: Tones
}

export function createGameOverScreen({
  mode,
  stats,
  onRetry,
  onMenu,
  onShowLeaderboard,
  provider,
  tones,
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

  const mute = createMuteButton(tones)

  const boardButton = document.createElement('button')
  boardButton.type = 'button'
  boardButton.className = 'btn btn--ghost'
  boardButton.dataset.noRetry = ''
  boardButton.textContent = provider.label
  boardButton.addEventListener('click', () => onShowLeaderboard())

  const actions = document.createElement('div')
  actions.className = 'over__actions'
  actions.append(retry, menu, boardButton, mute.element)

  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.innerHTML =
    'Any key or click to retry · <kbd>esc</kbd> for the menu · <kbd>m</kbd> mutes'

  element.append(heading, score, modeTag, statList)
  // A run that cleared nothing has nothing to submit.
  if (stats.level > 0) element.append(createSubmitForm())
  element.append(actions, hint)

  /** Save-this-run form. Prefilled, so a mouse-only player can just click. */
  function createSubmitForm(): HTMLFormElement {
    const form = document.createElement('form')
    form.className = 'submit'
    // Typing in here must not be read as the one input that retries.
    form.dataset.noRetry = ''

    const label = document.createElement('label')
    label.className = 'submit__label'
    label.htmlFor = 'nickname'
    label.textContent = `Save to ${provider.label.toLowerCase()}`

    const input = document.createElement('input')
    input.id = 'nickname'
    input.className = 'submit__input'
    input.type = 'text'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.minLength = NICKNAME_MIN
    input.maxLength = NICKNAME_MAX
    input.placeholder = 'nickname'
    input.value = readLastNickname()

    const save = document.createElement('button')
    save.type = 'submit'
    save.className = 'btn'
    save.textContent = 'Save'

    const note = document.createElement('p')
    note.className = 'submit__note'
    note.textContent = `${NICKNAME_MIN}–${NICKNAME_MAX} characters`

    const row = document.createElement('div')
    row.className = 'submit__row'
    row.append(input, save)
    form.append(label, row, note)

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const nickname = normaliseNickname(input.value)
      if (!isValidNickname(nickname)) {
        note.textContent = `Nickname needs ${NICKNAME_MIN}–${NICKNAME_MAX} characters`
        note.dataset.error = 'true'
        input.focus()
        return
      }

      save.disabled = true
      input.disabled = true
      rememberNickname(nickname)
      void provider
        .submit({
          nickname,
          mode: stats.mode,
          level: stats.level,
          avgReactionMs: stats.avgReactionMs,
          fastestInputMs: stats.fastestInputMs,
          totalInputs: stats.totalInputs,
          runDurationMs: stats.runDurationMs,
        })
        .then((entry) => onShowLeaderboard(entry.achievedAt))
        .catch(() => {
          save.disabled = false
          input.disabled = false
          note.textContent = "Couldn't save that run"
          note.dataset.error = 'true'
        })
    })

    return form
  }

  // Retry must cost exactly one input, whichever device the player is on.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Tab' || MODIFIER_KEYS.has(event.key)) return
    // 'm' belongs to the mute toggle on every screen, this one included.
    if (event.key === 'm' || event.key === 'M') return
    // Focus inside the submit form (or on any control that isn't Retry) means
    // the player is typing a nickname or aiming at a button, not retrying.
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.closest('[data-no-retry]')) {
      return
    }
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
      mute.destroy()
      element.remove()
    },
  }
}

/* Leaderboard ------------------------------------------------------------- */

export interface LeaderboardScreenOptions {
  readonly provider: LeaderboardProvider
  /** Which board to open on. */
  readonly mode: ModeDef
  readonly onBack: () => void
  readonly tones: Tones
  /** `achievedAt` of a run just saved, highlighted in the list. */
  readonly highlight?: string
  readonly firstRunOfSession?: boolean
}

export function createLeaderboardScreen({
  provider,
  mode,
  onBack,
  tones,
  highlight,
  firstRunOfSession,
}: LeaderboardScreenOptions): Screen {
  const element = document.createElement('section')
  element.className = 'screen screen--board'

  let shown = mode
  let cancelled = false

  const title = document.createElement('h2')
  title.className = 'board-title'
  title.textContent = provider.label

  // Boards are per mode and never merged: a level-10 clicks run is not a
  // level-10 arrows run. Say so rather than letting the tabs imply otherwise.
  const note = document.createElement('p')
  note.className = 'hint'
  note.textContent =
    'Kept on this machine only. Ranked per mode — the two are never merged.'

  const tabs = document.createElement('div')
  tabs.className = 'tabs'
  tabs.setAttribute('role', 'tablist')

  const tabButtons = MODES.map((candidate) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'tab'
    tab.role = 'tab'
    tab.textContent = candidate.name
    tab.addEventListener('click', () => select(candidate))
    tabs.append(tab)
    return { mode: candidate, tab }
  })

  const list = document.createElement('ol')
  list.className = 'entries'

  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'btn'
  back.textContent = 'Back'
  back.addEventListener('click', onBack)

  const mute = createMuteButton(tones)

  const controls = document.createElement('div')
  controls.className = 'controls'
  controls.append(back, mute.element)

  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.innerHTML = '<kbd>←</kbd><kbd>→</kbd> switch mode · <kbd>esc</kbd> back'

  element.append(title, note, tabs, list, controls, hint)

  function select(next: ModeDef): void {
    shown = next
    for (const { mode: candidate, tab } of tabButtons) {
      const active = candidate.id === next.id
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    }
    void load()
  }

  async function load(): Promise<void> {
    const forMode = shown
    const entries = await provider.top(forMode.id)
    // A tab switch while this was in flight wins.
    if (cancelled || forMode.id !== shown.id) return
    renderEntries(entries)
  }

  function renderEntries(entries: readonly Entry[]): void {
    list.replaceChildren()

    if (entries.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'entries__empty'
      empty.textContent = 'No runs yet. The board fills as you play.'
      list.append(empty)
      return
    }

    entries.forEach((entry, index) => {
      const isHighlight =
        highlight !== undefined && entry.achievedAt === highlight
      list.append(
        createEntryRow(entry, index + 1, {
          highlight: isHighlight,
          firstRunOfSession: isHighlight && firstRunOfSession,
        }),
      )
    })
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onBack()
      return
    }
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const at = MODES.findIndex((candidate) => candidate.id === shown.id)
    select(MODES[(at + step + MODES.length) % MODES.length])
  }

  window.addEventListener('keydown', onKeyDown)
  select(mode)
  queueMicrotask(() => back.focus())

  return {
    element,
    destroy() {
      cancelled = true
      window.removeEventListener('keydown', onKeyDown)
      mute.destroy()
      element.remove()
    },
  }
}

function createEntryRow(
  entry: Entry,
  rank: number,
  options: { highlight: boolean; firstRunOfSession?: boolean },
): HTMLLIElement {
  const row = document.createElement('li')
  row.className = options.highlight ? 'entry is-you' : 'entry'
  // Accent each row with its mode's first symbol colour.
  row.style.setProperty(
    '--sym',
    `var(${getMode(entry.mode).symbols[0].colorVar})`,
  )

  const position = document.createElement('span')
  position.className = 'entry__rank'
  position.textContent = String(rank)

  const name = document.createElement('span')
  name.className = 'entry__name'
  name.textContent = entry.nickname

  const level = document.createElement('span')
  level.className = 'entry__level'
  level.textContent = `L${entry.level}`

  const reaction = document.createElement('span')
  reaction.className = 'entry__reaction'
  reaction.textContent = `${entry.avgReactionMs} ms avg`
  reaction.title = `fastest ${entry.fastestInputMs} ms · ${entry.totalInputs} inputs · ${(entry.runDurationMs / 1000).toFixed(1)} s`

  const when = document.createElement('time')
  when.className = 'entry__when'
  when.dateTime = entry.achievedAt
  // Relative reads faster; absolute is the one you can actually trust.
  when.textContent = relativeTime(entry.achievedAt)
  when.title = absoluteTime(entry.achievedAt)

  row.append(position, name, level, reaction, when)

  const labels = labelsFor(entry, {
    firstRunOfSession: options.firstRunOfSession,
  })
  if (labels.length > 0) {
    const tags = document.createElement('span')
    tags.className = 'entry__labels'
    for (const label of labels) {
      const tag = document.createElement('span')
      tag.className = 'tag'
      tag.textContent = label
      tags.append(tag)
    }
    row.append(tags)
  }

  return row
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
