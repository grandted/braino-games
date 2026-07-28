/**
 * Screens: menu, game, gameover.
 *
 * Screens render and report intent; they hold no game rules. Every screen
 * is operable with the keyboard alone and with the mouse alone.
 */

import { MODES, TIMING, type ModeDef, type SymbolId } from '../game/modes.ts'
import { genomeProgress, organismFor } from '../game/evolution.ts'
import type { RunStats } from '../game/engine.ts'
import {
  DEFAULT_WINDOW,
  NICKNAME_MAX,
  NICKNAME_MIN,
  TIME_WINDOWS,
  absoluteTime,
  isValidNickname,
  labelsFor,
  normaliseNickname,
  readBest,
  readLastNickname,
  relativeTime,
  rememberNickname,
  timeWindowLabel,
  type Entry,
  type LeaderboardProvider,
  type TimeWindow,
} from '../leaderboard/index.ts'
import { createBoard, type Board } from './board.ts'
import { createHelix, type Helix } from './helix.ts'
import type { Tones } from './audio.ts'

export interface Screen {
  readonly element: HTMLElement
  destroy(): void
}

/**
 * A hint line that says the right thing on the right device. Telling a phone
 * player to press escape is worse than saying nothing; CSS picks the variant
 * from `(pointer: coarse)` so there's no device sniffing involved.
 */
function createHint(keysHtml: string, touchText: string): HTMLParagraphElement {
  const hint = document.createElement('p')
  hint.className = 'hint'

  const forKeys = document.createElement('span')
  forKeys.className = 'on-keys'
  forKeys.innerHTML = keysHtml

  const forTouch = document.createElement('span')
  forTouch.className = 'on-touch'
  forTouch.textContent = touchText

  hint.append(forKeys, forTouch)
  return hint
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

  // The game's signature object, on the title screen where it belongs. Purely
  // decorative here: it is never bonded, and its hue drifts through the
  // organism palette in CSS, so no timer runs behind the menu.
  const strand = createHelix(MODES[0])
  strand.element.classList.add('helix--menu')
  strand.setLive(true)
  strand.setGenome(23, 36, 285)

  const subtitle = document.createElement('p')
  subtitle.className = 'subtitle'
  subtitle.textContent =
    'A pattern grows one step at a time. Keep it in your hands, not your head.'

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

    // A preview of what you'll actually be pressing, in the colours the game
    // uses for them. Teaches the mode and gives the menu some colour.
    const glyphs = document.createElement('span')
    glyphs.className = 'mode-card__glyphs'
    for (const symbol of mode.symbols) {
      const glyph = document.createElement('span')
      glyph.className = 'mode-card__glyph'
      glyph.style.setProperty('--sym', `var(${symbol.colorVar})`)
      glyph.textContent = symbol.glyph
      glyphs.append(glyph)
    }

    const tagline = document.createElement('span')
    tagline.className = 'mode-card__tagline'
    tagline.textContent = mode.tagline

    button.append(number, name, glyphs, tagline)
    button.addEventListener('click', () => onPick(mode))
    list.append(button)
    return button
  })

  const rules = document.createElement('p')
  rules.className = 'menu-rules'
  rules.textContent =
    'Three lives. Miss and the round replays. Solve it faster to score more.'

  // Your own record, so there's a target long before the global board is
  // in reach.
  const bests = MODES.map((mode) => ({ mode, best: readBest(mode.id) })).filter(
    (entry) => entry.best !== null,
  )
  const personal = document.createElement('p')
  personal.className = 'menu-best'
  if (bests.length > 0) {
    personal.innerHTML =
      'Your best — ' +
      bests
        .map(
          ({ mode, best }) =>
            `${mode.name} <strong>${best!.points.toLocaleString()}</strong>`,
        )
        .join(' · ')
  }

  const hint = createHint(
    '<kbd>↑</kbd><kbd>↓</kbd> to choose · <kbd>enter</kbd> to start · ' +
      '<kbd>m</kbd> for sound',
    'Tap a mode to begin.',
  )

  const mute = createMuteButton(tones)

  const board = document.createElement('button')
  board.type = 'button'
  board.className = 'btn btn--ghost'
  board.textContent = leaderboardLabel
  board.addEventListener('click', onShowLeaderboard)

  const controls = document.createElement('div')
  controls.className = 'controls'
  controls.append(board, mute.element)

  element.append(title, strand.element, subtitle, list, rules, hint, controls)
  if (bests.length > 0) element.insertBefore(personal, hint)

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
      strand.destroy()
      element.remove()
    },
  }
}

/* Game -------------------------------------------------------------------- */

export type StatusTone = 'watch' | 'go' | 'good' | 'bad' | 'paused'

export interface GameScreen extends Screen {
  readonly board: Board
  readonly helix: Helix
  setRound(round: number): void
  /** The organism being solved, and how far into its genome the run is. */
  setEvolution(
    level: number,
    organism: string,
    bonded: number,
    genome: number,
    hue: number,
  ): void
  /** How many rounds until the next organism. */
  setNextLevel(roundsAway: number, organism: string): void
  setPoints(points: number): void
  /** A genome completed: announce the new organism and change the palette. */
  evolve(level: number, organism: string): void
  /** Past the named ladder the game stops looking like itself. */
  setAnomaly(anomaly: boolean): void
  /** A one-off flourish for something rare, like a free life. */
  celebrate(): void
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

  // Points lead the HUD because they lead the leaderboard.
  const points = document.createElement('p')
  points.className = 'hud__points'

  const round = document.createElement('p')
  round.className = 'hud__round'

  const evolution = document.createElement('p')
  evolution.className = 'evolution'

  const nextUp = document.createElement('p')
  nextUp.className = 'next-up'

  const organismName = document.createElement('span')
  organismName.className = 'evolution__name'

  const genomeBar = document.createElement('span')
  genomeBar.className = 'evolution__genome'
  const genomeFill = document.createElement('span')
  genomeFill.className = 'evolution__fill'
  genomeBar.append(genomeFill)

  evolution.append(organismName, genomeBar)

  const status = document.createElement('p')
  status.className = 'hud__status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const lives = document.createElement('p')
  lives.className = 'lives'

  header.append(modeTag, points, round, evolution, nextUp, lives, status)

  const progress = document.createElement('div')
  progress.className = 'progress'
  progress.setAttribute('aria-hidden', 'true')

  // Sits over the board for the length of the evolution cue, then clears.
  const banner = document.createElement('p')
  banner.className = 'evolve-banner'
  banner.setAttribute('aria-hidden', 'true')

  // The DNA strand: between the level info and the pads, as asked.
  const helix = createHelix(mode)

  // The whole screen is the play area, not just the pad — a click that lands
  // slightly off a pad in clicks mode should still count.
  const board = createBoard({ mode, onInput, surface: element })

  const footer = createHint(
    '<kbd>esc</kbd> to quit · <kbd>m</kbd> for sound',
    'Tap the pads in order.',
  )

  const quit = document.createElement('button')
  quit.type = 'button'
  quit.className = 'btn btn--ghost'
  quit.textContent = 'Quit'
  quit.addEventListener('click', onExit)

  const mute = createMuteButton(tones)

  const controls = document.createElement('div')
  controls.className = 'controls'
  controls.append(quit, mute.element)

  element.append(
    header,
    banner,
    helix.element,
    board.element,
    progress,
    controls,
    footer,
  )

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onExit()
  }

  window.addEventListener('keydown', onKeyDown)

  return {
    element,
    board,
    helix,

    setRound(value) {
      round.textContent = `Round ${value}`
    },

    setEvolution(value, organism, bonded, genome, hue) {
      organismName.textContent = `Level ${value} · ${organism}`
      const filled = genome === 0 ? 0 : Math.min(bonded / genome, 1)
      genomeFill.style.transform = `scaleX(${filled})`
      genomeBar.setAttribute(
        'aria-label',
        `${bonded} of ${genome} base pairs bonded`,
      )
      helix.setGenome(bonded, genome, hue)
      // Tints the screen's backdrop to match the organism.
      element.style.setProperty('--level-hue', String(hue))
      element.dataset.level = String(value)
    },

    setNextLevel(roundsAway, organism) {
      nextUp.textContent =
        roundsAway <= 0
          ? ''
          : roundsAway === 1
            ? `1 round to ${organism}`
            : `${roundsAway} rounds to ${organism}`
    },

    setPoints(value) {
      points.textContent = value.toLocaleString()
    },

    setAnomaly(anomaly) {
      element.classList.toggle('is-anomaly', anomaly)
      helix.setAnomaly(anomaly)
    },

    celebrate() {
      element.classList.remove('is-celebrating')
      void element.offsetWidth
      element.classList.add('is-celebrating')
      window.setTimeout(() => {
        element.classList.remove('is-celebrating')
      }, TIMING.nextRoundDelayMs)
    },

    evolve(value, organism) {
      // The organism the run just *became* is the one after the genome that
      // completed, which setEvolution paints on the next round event.
      const next = organismFor(value + 1)
      banner.textContent = `${organism} → ${next.name}`
      // Start the backdrop moving now rather than waiting for the next round,
      // so the colour change and the bloom are one moment instead of two.
      element.style.setProperty('--level-hue', String(next.hue))
      helix.evolve()
      element.classList.remove('is-evolving')
      void element.offsetWidth
      element.classList.add('is-evolving')
      window.setTimeout(() => {
        element.classList.remove('is-evolving')
      }, TIMING.nextRoundDelayMs)
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
      helix.destroy()
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
  /** Standing record for this mode, and whether this run set it. */
  readonly best: { points: number; improved: boolean }
  readonly onRetry: () => void
  readonly onMenu: () => void
  /** `highlight` is the id of a run just saved, with the rank it earned. */
  readonly onShowLeaderboard: (highlight?: string, rank?: number) => void
  readonly provider: LeaderboardProvider
  readonly tones: Tones
}

export function createGameOverScreen({
  mode,
  stats,
  best,
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
  heading.textContent = headingFor(stats.rounds)

  const score = document.createElement('p')
  score.className = 'over__score'
  score.innerHTML =
    stats.rounds === 0
      ? 'No rounds cleared'
      : `<strong>${stats.points.toLocaleString()}</strong> points`

  const reached = document.createElement('p')
  reached.className = 'over__reached'
  reached.textContent =
    stats.rounds === 0
      ? 'Still a single cell'
      : `Level ${stats.level} · ${stats.organism} · round ${stats.rounds}`

  const modeTag = document.createElement('p')
  modeTag.className = 'over__mode'
  modeTag.textContent = `${mode.name} mode`

  // The run's final strand, frozen. A closing image of what you became.
  const strand = createHelix(mode)
  strand.element.classList.add('helix--result')
  const finalGenome = genomeProgress(stats.rounds, stats.basePairs)
  strand.setGenome(
    finalGenome.bonded,
    finalGenome.genome,
    organismFor(stats.level).hue,
  )
  strand.setAnomaly(organismFor(stats.level).anomaly)

  const record = document.createElement('p')
  record.className = best.improved ? 'over__record is-new' : 'over__record'
  if (stats.rounds > 0) {
    record.textContent = best.improved
      ? 'A new personal best'
      : `Your best · ${best.points.toLocaleString()}`
  }

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
  retry.textContent = 'Play again'
  retry.addEventListener('click', onRetry)

  const menu = document.createElement('button')
  menu.type = 'button'
  menu.className = 'btn btn--ghost'
  menu.textContent = 'Menu'
  menu.addEventListener('click', onMenu)

  const mute = createMuteButton(tones)

  const boardButton = document.createElement('button')
  boardButton.type = 'button'
  boardButton.className = 'btn btn--ghost'
  boardButton.textContent = provider.label
  boardButton.addEventListener('click', () => onShowLeaderboard())

  const actions = document.createElement('div')
  actions.className = 'over__actions'
  actions.append(retry, menu, boardButton, mute.element)

  const hint = createHint(
    'Any key to play again · <kbd>esc</kbd> for the menu · <kbd>m</kbd> for sound',
    'Tap anywhere to play again.',
  )

  element.append(heading, score, reached)
  if (stats.rounds > 0) element.append(strand.element)
  element.append(modeTag)
  if (stats.rounds > 0) element.append(record)
  element.append(statList)
  // A run that cleared nothing has nothing to submit.
  if (stats.rounds > 0) element.append(createSubmitForm())
  element.append(actions, hint)

  /** Save-this-run form. Prefilled, so a mouse-only player can just click. */
  function createSubmitForm(): HTMLFormElement {
    const form = document.createElement('form')
    // The .submit class is load-bearing: the retry fallback keys off it so
    // typing a nickname is never read as "play again".
    form.className = 'submit'

    const label = document.createElement('label')
    label.className = 'submit__label'
    label.htmlFor = 'nickname'
    label.textContent = 'Put it on the board'

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
        note.textContent = `Pick a name of ${NICKNAME_MIN}–${NICKNAME_MAX} characters`
        note.dataset.error = 'true'
        input.focus()
        return
      }

      save.disabled = true
      input.disabled = true
      save.textContent = 'Saving…'
      delete note.dataset.error
      note.textContent = 'Sending your run…'
      rememberNickname(nickname)

      void provider
        .submit({
          nickname,
          mode: stats.mode,
          points: stats.points,
          level: stats.level,
          rounds: stats.rounds,
          avgReactionMs: stats.avgReactionMs,
          fastestInputMs: stats.fastestInputMs,
          totalInputs: stats.totalInputs,
          runDurationMs: stats.runDurationMs,
        })
        .then((result) => onShowLeaderboard(result.entry.id, result.rank ?? undefined))
        .catch((error: unknown) => {
          // The run is not lost — the form comes back so it can be retried.
          save.disabled = false
          input.disabled = false
          save.textContent = 'Save'
          note.textContent =
            error instanceof Error
              ? `Couldn't save — ${error.message}`
              : "Couldn't save that run"
          note.dataset.error = 'true'
        })
    })

    return form
  }

  // Retry must cost exactly one input, whichever device the player is on:
  // any key, or a click anywhere that isn't a control.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Tab' || MODIFIER_KEYS.has(event.key)) return
    // 'm' belongs to the mute toggle on every screen, this one included.
    if (event.key === 'm' || event.key === 'M') return

    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    // Typing a nickname is not a retry.
    if (focused?.closest('.submit')) return
    // Enter and space belong to whichever button has focus — Retry is focused
    // by default, so this is still one key to play again, just via the button.
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      focused?.closest('button')
    ) {
      return
    }

    event.preventDefault()
    if (event.repeat) return
    if (event.key === 'Escape') onMenu()
    else onRetry()
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null
    // Controls fire their own click handlers; letting the fallback run here
    // too would retry twice off one press.
    if (target?.closest('button, .submit')) return
    event.preventDefault()
    onRetry()
  }

  function onContextMenu(event: MouseEvent): void {
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('contextmenu', onContextMenu)
  queueMicrotask(() => retry.focus())

  return {
    element,
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('contextmenu', onContextMenu)
      mute.destroy()
      strand.destroy()
      element.remove()
    },
  }
}

/* Leaderboard ------------------------------------------------------------- */

export interface LeaderboardScreenOptions {
  readonly provider: LeaderboardProvider
  /** Which board to open on. */
  readonly mode: ModeDef
  /** Which period to open on. Defaults to the shared default window. */
  readonly initialWindow?: TimeWindow
  readonly onBack: () => void
  readonly tones: Tones
  /** `id` of a run just saved, highlighted in the list. */
  readonly highlight?: string
  /** All-time rank of that run, announced above the board. */
  readonly rank?: number
  readonly firstRunOfSession?: boolean
}

export function createLeaderboardScreen({
  provider,
  mode,
  initialWindow,
  onBack,
  tones,
  highlight,
  rank,
  firstRunOfSession,
}: LeaderboardScreenOptions): Screen {
  const element = document.createElement('section')
  element.className = 'screen screen--board'

  let shown = mode
  let shownWindow: TimeWindow = initialWindow ?? DEFAULT_WINDOW
  let cancelled = false
  let requestId = 0

  const title = document.createElement('h2')
  title.className = 'board-title'
  title.textContent = provider.label

  // Boards are per mode and never merged: a level-10 clicks run is not a
  // level-10 arrows run. Say so rather than letting the tabs imply otherwise.
  const note = document.createElement('p')
  note.className = 'hint'
  note.textContent =
    'Every player, ranked on points. Arrows and Clicks are scored separately.'

  const tabs = document.createElement('div')
  tabs.className = 'tabs'
  tabs.setAttribute('role', 'tablist')

  const tabButtons = MODES.map((candidate) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'tab'
    tab.role = 'tab'
    tab.textContent = candidate.name
    tab.addEventListener('click', () => select(candidate, shownWindow))
    tabs.append(tab)
    return { mode: candidate, tab }
  })

  const windows = document.createElement('div')
  windows.className = 'tabs tabs--window'
  windows.setAttribute('role', 'tablist')

  const windowButtons = TIME_WINDOWS.map((candidate) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'tab tab--window'
    tab.role = 'tab'
    tab.textContent = candidate.label
    tab.addEventListener('click', () => select(shown, candidate.id))
    windows.append(tab)
    return { id: candidate.id, tab }
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

  const hint = createHint(
    '<kbd>←</kbd><kbd>→</kbd> mode · <kbd>↑</kbd><kbd>↓</kbd> period · <kbd>esc</kbd> back',
    'Tap a mode or a period to switch.',
  )

  // Only after saving a run: the one number the player actually wants.
  if (rank !== undefined) {
    const placed = document.createElement('p')
    placed.className = 'placed'
    placed.innerHTML =
      rank === 1
        ? 'You are <strong>#1</strong> of all time'
        : `You placed <strong>#${rank}</strong> of all time`
    element.append(title, placed, note, tabs, windows, list, controls, hint)
  } else {
    element.append(title, note, tabs, windows, list, controls, hint)
  }

  function select(nextMode: ModeDef, nextWindow: TimeWindow): void {
    shown = nextMode
    shownWindow = nextWindow

    for (const { mode: candidate, tab } of tabButtons) {
      const active = candidate.id === nextMode.id
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    }
    for (const { id, tab } of windowButtons) {
      const active = id === nextWindow
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    }

    void load()
  }

  async function load(): Promise<void> {
    const forMode = shown
    const forWindow = shownWindow
    // Each request gets a ticket; only the newest one is allowed to render.
    requestId += 1
    const ticket = requestId

    renderMessage('Reading the board…', 'loading')

    try {
      const entries = await provider.top(forMode.id, forWindow)
      if (cancelled || ticket !== requestId) return
      renderEntries(entries)
    } catch (error) {
      if (cancelled || ticket !== requestId) return
      // An empty board and an unreachable board must not look the same.
      renderMessage(
        error instanceof Error ? error.message : "Can't reach the board",
        'error',
        () => void load(),
      )
    }
  }

  function renderMessage(
    text: string,
    tone: 'loading' | 'error' | 'empty',
    retry?: () => void,
  ): void {
    list.replaceChildren()
    const message = document.createElement('p')
    message.className = 'entries__message'
    message.dataset.tone = tone
    message.textContent = text
    list.append(message)

    if (retry) {
      const again = document.createElement('button')
      again.type = 'button'
      again.className = 'btn btn--ghost'
      again.textContent = 'Try again'
      again.addEventListener('click', retry)
      list.append(again)
    }
  }

  function renderEntries(entries: readonly Entry[]): void {
    if (entries.length === 0) {
      renderMessage(
        `Nothing here for ${timeWindowLabel(shownWindow).toLowerCase()}. Yours could be first.`,
        'empty',
      )
      return
    }

    list.replaceChildren()
    entries.forEach((entry, index) => {
      const isHighlight = highlight !== undefined && entry.id === highlight
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

    const modeStep =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (modeStep !== 0) {
      event.preventDefault()
      const at = MODES.findIndex((candidate) => candidate.id === shown.id)
      select(MODES[(at + modeStep + MODES.length) % MODES.length], shownWindow)
      return
    }

    const windowStep =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (windowStep === 0) return
    event.preventDefault()
    const at = TIME_WINDOWS.findIndex(
      (candidate) => candidate.id === shownWindow,
    )
    const next =
      TIME_WINDOWS[(at + windowStep + TIME_WINDOWS.length) % TIME_WINDOWS.length]
    select(shown, next.id)
  }

  window.addEventListener('keydown', onKeyDown)
  select(mode, initialWindow ?? DEFAULT_WINDOW)
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
  // Accent by the organism the run reached, so the board reads as a column of
  // species rather than a column of one colour.
  const organism = organismFor(entry.level)
  row.style.setProperty('--sym', `hsl(${organism.hue} 82% 64%)`)

  const position = document.createElement('span')
  position.className = 'entry__rank'
  position.textContent = String(rank)

  const name = document.createElement('span')
  name.className = 'entry__name'
  name.textContent = entry.nickname

  const points = document.createElement('span')
  points.className = 'entry__points'
  points.textContent = entry.points.toLocaleString()

  const reaction = document.createElement('span')
  reaction.className = 'entry__reaction'
  reaction.textContent = `L${entry.level} ${organism.name} · ${entry.rounds} rounds · ${entry.avgReactionMs} ms`
  reaction.title = `fastest ${entry.fastestInputMs} ms · ${entry.totalInputs} inputs · ${(entry.runDurationMs / 1000).toFixed(1)} s`

  const when = document.createElement('time')
  when.className = 'entry__when'
  when.dateTime = entry.achievedAt
  // Relative reads faster; absolute is the one you can actually trust.
  when.textContent = relativeTime(entry.achievedAt)
  when.title = absoluteTime(entry.achievedAt)

  row.append(position, name, points, reaction, when)

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

/** A word for how the run went, so the screen isn't the same every time. */
function headingFor(rounds: number): string {
  if (rounds === 0) return 'Out of lives'
  if (rounds < 5) return 'Run over'
  if (rounds < 14) return 'Good run'
  if (rounds < 25) return 'Strong run'
  return 'Serious run'
}

/** Seconds under a minute, minutes and seconds above it. */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

function statRows(stats: RunStats): ReadonlyArray<readonly [string, string]> {
  if (stats.totalInputs === 0) return [['Inputs', '0']]
  return [
    ['Rounds', String(stats.rounds)],
    ['DNA bonded', `${stats.basePairs} bp`],
    ['Reaction', `${stats.avgReactionMs} ms`],
    ['Fastest', `${stats.fastestInputMs} ms`],
    ['Inputs', String(stats.totalInputs)],
    ['Misses', String(stats.mistakes)],
    ['Time', formatDuration(stats.runDurationMs)],
  ]
}
