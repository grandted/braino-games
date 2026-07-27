import './styles/base.css'
import './styles/board.css'
import './styles/screens.css'

import { Engine, type EngineEvent, type RunStats } from './game/engine.ts'
import { RULES, TIMING, getSymbol, type ModeDef } from './game/modes.ts'
import { createTones } from './ui/audio.ts'
import {
  createGameOverScreen,
  createGameScreen,
  createMenuScreen,
  type GameScreen,
  type Screen,
} from './ui/screens.ts'

function mountPoint(): HTMLElement {
  const element = document.querySelector<HTMLDivElement>('#app')
  if (!element) throw new Error('#app is missing from index.html')
  return element
}

const app = mountPoint()
const tones = createTones()

let current: Screen | null = null
let leaveCurrent: (() => void) | null = null

/** Swap screens. `onLeave` runs when this screen is replaced. */
function show(screen: Screen, onLeave?: () => void): void {
  leaveCurrent?.()
  current?.destroy()
  current = screen
  leaveCurrent = onLeave ?? null
  app.append(screen.element)
}

function showMenu(): void {
  show(createMenuScreen({ onPick: playMode, tones }))
}

function showGameOver(mode: ModeDef, stats: RunStats): void {
  show(
    createGameOverScreen({
      mode,
      stats,
      tones,
      onRetry: () => playMode(mode),
      onMenu: showMenu,
    }),
  )
}

function livesLabel(count: number): string {
  return count === 1 ? '1 life' : `${count} lives`
}

function playMode(mode: ModeDef): void {
  let screen: GameScreen

  const engine = new Engine({ mode, emit: (event) => render(event) })

  /** The only place engine events become pixels. */
  function render(event: EngineEvent): void {
    switch (event.type) {
      case 'level':
        screen.setLevel(event.level)
        screen.setProgress(0, event.sequence.length)
        screen.board.clear()
        break

      case 'phase':
        screen.board.setLocked(event.phase === 'playback')
        if (event.phase === 'playback') screen.setStatus('watch', 'watch')
        else if (event.phase === 'input') screen.setStatus('your turn', 'go')
        else if (event.phase === 'paused')
          screen.setStatus('focus lost — replaying', 'paused')
        break

      case 'flashOn':
        screen.board.flash(event.symbol, event.durationMs)
        // The tone is held for exactly the flash — sound and motion together
        // are what make the sequence stick.
        tones.play(getSymbol(mode, event.symbol), event.durationMs)
        break

      case 'accept':
        screen.board.pressed(event.symbol)
        tones.play(getSymbol(mode, event.symbol), TIMING.inputFlashMs)
        screen.setProgress(event.index + 1, engine.sequence.length)
        break

      case 'levelClear':
        screen.setStatus('clear', 'good')
        tones.levelClear()
        break

      case 'lives':
        screen.setLives(event.left, RULES.lives)
        break

      case 'reject': {
        const expected = getSymbol(mode, event.expected).name
        screen.setStatus(
          event.livesLeft === 0
            ? `it was ${expected} — out`
            : `it was ${expected} — ${livesLabel(event.livesLeft)} left`,
          'bad',
        )
        screen.setLives(event.livesLeft, RULES.lives)
        screen.board.showMiss(event.expected, event.received)
        screen.shake()
        tones.miss()
        break
      }

      case 'gameOver':
        showGameOver(mode, event.stats)
        break

      // flashOff and playbackEnd need no rendering — pads unlight themselves
      // when their flash duration elapses.
      default:
        break
    }
  }

  // Losing focus mid-playback would be an unfair miss, so the engine pauses
  // and replays the level when focus comes back.
  const onBlur = (): void => engine.handleBlur()
  const onFocus = (): void => engine.handleFocus()
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)

  // We're inside the click or keypress that picked the mode, which is the
  // only moment a browser will let an AudioContext start.
  tones.resume()

  screen = createGameScreen({
    mode,
    tones,
    onInput: (symbol) => engine.press(symbol),
    onExit: showMenu,
  })

  show(screen, () => {
    engine.stop()
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
  })

  engine.start()
}

showMenu()
