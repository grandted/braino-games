import './styles/base.css'
import './styles/board.css'
import './styles/screens.css'
import './styles/helix.css'

import { Engine, type EngineEvent, type RunStats } from './game/engine.ts'
import { MODES, TIMING, getSymbol, type ModeDef } from './game/modes.ts'
import { createLeaderboard, recordRun } from './leaderboard/index.ts'
import { organismFor, roundsForLevel } from './game/evolution.ts'
import { formatPi } from './game/pi.ts'
import { createTones } from './ui/audio.ts'
import {
  createGameOverScreen,
  createGameScreen,
  createLeaderboardScreen,
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
const leaderboard = createLeaderboard()
/** For the "one and done" label: was the run just saved the session's first? */
let runsThisSession = 0
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
let lastMode: ModeDef = MODES[0]
function showMenu(): void {
  show(
    createMenuScreen({
      onPick: playMode,
      onShowLeaderboard: () => showLeaderboard(lastMode),
      tones,
      leaderboardLabel: leaderboard.label,
    }),
  )
}
function showLeaderboard(
  mode: ModeDef,
  highlight?: string,
  rank?: number,
): void {
  show(
    createLeaderboardScreen({
      provider: leaderboard,
      mode,
      // A run just saved is minutes old, so open on the window that is certain
      // to contain it rather than the default one, which might not.
      initialWindow: highlight === undefined ? undefined : '24h',
      tones,
      highlight,
      rank,
      firstRunOfSession: runsThisSession === 1,
      onBack: showMenu,
    }),
  )
}
function showGameOver(mode: ModeDef, stats: RunStats): void {
  // Banked before the screen renders, so "a new personal best" is decided
  // against the record as it stood when the run started.
  const { best, improved } = recordRun(mode.id, {
    points: stats.points,
    level: stats.level,
    rounds: stats.rounds,
  })

  show(
    createGameOverScreen({
      mode,
      stats,
      best: { points: best.points, improved },
      tones,
      provider: leaderboard,
      onRetry: () => playMode(mode),
      onMenu: showMenu,
      onShowLeaderboard: (highlight, rank) =>
        showLeaderboard(mode, highlight, rank),
    }),
  )
}
function livesLabel(count: number): string {
  return count === 1 ? '1 life' : `${count} lives`
}
function playMode(mode: ModeDef): void {
  let screen: GameScreen
  lastMode = mode
  runsThisSession += 1
  const engine = new Engine({ mode, emit: (event) => render(event) })
  /** Push the engine's genome state at the HUD. */
  function paintGenome(): void {
    const { organism, bonded, genome } = engine.genome
    screen.setEvolution(organism.tier, organism.name, bonded, genome, organism.hue)
    screen.setAnomaly(organism.anomaly)
  }
  /** The only place engine events become pixels. */
  function render(event: EngineEvent): void {
    switch (event.type) {
      case 'round': {
        screen.setRound(event.round)
        screen.setProgress(0, event.sequence.length)
        // A readout mode spells out the run; each round starts it again.
        if (mode.readout) screen.setReadout(formatPi(0))
        paintGenome()
        // A concrete target, in the unit the player actually controls.
        const level = engine.level
        const nextAt = roundsForLevel(level + 1)
        screen.setNextLevel(
          nextAt - (event.round - 1),
          organismFor(level + 1).name,
        )
        screen.board.clear()
        break
      }
      case 'phase':
        screen.board.setLocked(event.phase === 'playback')
        // The strand hangs still while the sequence plays, and spins up when
        // it is the player's turn — the locked state, made visible.
        screen.helix.setLive(event.phase === 'input')
        // The bed drops under playback so the pattern sits on top of the mix.
        tones.duck(event.phase === 'playback')
        if (event.phase === 'playback') screen.setStatus('watch', 'watch')
        else if (event.phase === 'input') screen.setStatus('your turn', 'go')
        else if (event.phase === 'paused')
          screen.setStatus('paused · replaying', 'paused')
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
        // Written the way a person writes it: 3.14159
        if (mode.readout) screen.setReadout(formatPi(event.index + 1))
        // One correct input bonds one base pair of the current genome.
        paintGenome()
        screen.helix.bond(event.symbol)
        break
      case 'roundClear':
        screen.setStatus(`clear · +${event.points.toLocaleString()}`, 'good')
        screen.setPoints(event.totalPoints)
        tones.roundClear(event.round)
        break
      case 'evolve':
        // The Tetris moment: a genome completed, so the run changes species.
        screen.setStatus('evolved', 'good')
        screen.setPoints(event.totalPoints)
        screen.evolve(event.level)
        tones.evolve()
        tones.setAmbienceLevel(event.level + 1)
        break
      case 'lives':
        screen.setLives(event.left, event.max)
        break
      case 'freeLife':
        // Round 100. Nobody has seen this happen.
        screen.setLives(event.left, event.max)
        screen.setStatus(`round ${event.round} · extra life`, 'good')
        screen.celebrate()
        tones.freeLife()
        break
      case 'reject': {
        const expected = getSymbol(mode, event.expected).name
        screen.setStatus(
          event.livesLeft === 0
            ? `it was ${expected} · out of lives`
            : `it was ${expected} · ${livesLabel(event.livesLeft)} left`,
          'bad',
        )
        screen.setLives(event.livesLeft, engine.livesMax)
        // The failed round's pairs just unbonded.
        paintGenome()
        screen.board.showMiss(event.expected, event.received)
        screen.shake()
        tones.miss()
        break
      }
      case 'gameOver':
        tones.stopAmbience()
        tones.gameOver()
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
  tones.startAmbience(mode)
  screen = createGameScreen({
    mode,
    tones,
    onInput: (symbol) => engine.press(symbol),
    onExit: showMenu,
  })
  screen.setPoints(0)
  show(screen, () => {
    engine.stop()
    // Leaving mid-run (quit, or a retry) must take the bed with it.
    tones.stopAmbience()
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
  })
  engine.start()
}
showMenu()
