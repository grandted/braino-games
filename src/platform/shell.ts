/**
 * The Braino Games shell: what is on screen, and how you get back.
 *
 * Routing is the URL hash, so the browser's own back button works and a game
 * can be linked to directly. `#/` is the deck; `#/tangent` is a game.
 *
 * The shell never imports a game. It reads the registry, calls `mount()`, and
 * calls `destroy()` on the way out.
 */

import { createLanding, type Landing } from './landing.ts'
import { findGame, GAMES } from './registry.ts'
import type { GameDefinition, GameHandle } from './types.ts'
import type { LeaderboardProvider } from '../shared/leaderboard/index.ts'

export interface ShellOptions {
  readonly container: HTMLElement
  readonly leaderboard: LeaderboardProvider
}

export function createShell({ container, leaderboard }: ShellOptions): void {
  const stage = document.createElement('div')
  stage.className = 'stage'

  // Persistent chrome: the way back, always in the same place. Hidden on the
  // deck, since there is nowhere further back to go.
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'shell-back'
  // Short on purpose: this sits over a game's HUD, including on a phone, where
  // the label collapses to the arrow alone.
  back.innerHTML =
    '<span aria-hidden="true">←</span>' +
    '<span class="shell-back__label">All games</span>'
  back.setAttribute('aria-label', 'Back to all games')
  back.addEventListener('click', () => navigate('/'))

  container.append(back, stage)

  let landing: Landing | null = null
  let running: GameHandle | null = null
  /**
   * Null, not '', and that matters: an empty hash resolves to the empty path,
   * so starting this at '' made the "already there" guard fire on the very
   * first call and render nothing at all.
   */
  let currentRoute: string | null = null

  function clearStage(): void {
    running?.destroy()
    running = null
    landing?.destroy()
    landing = null
    stage.replaceChildren()
  }

  function showLanding(): void {
    clearStage()
    document.body.dataset.view = 'deck'
    document.body.style.removeProperty('--game-hue')
    document.title = 'Braino Games'
    landing = createLanding((game) => navigate(`/${game.id}`))
    stage.append(landing.element)
  }

  function showGame(game: GameDefinition): void {
    clearStage()
    document.body.dataset.view = 'game'
    // The whole page takes on the game's colour while it is being played.
    document.body.style.setProperty('--game-hue', String(game.card.hue))
    document.title = `${game.name} · Braino Games`
    running = game.mount(stage, {
      exit: () => navigate('/'),
      leaderboard,
    })
  }

  /** Resolve the hash to a view. Unknown or unplayable ids fall back home. */
  function route(): void {
    const path = window.location.hash.replace(/^#\/?/, '')
    if (path === currentRoute) return
    currentRoute = path

    const game = path ? findGame(path) : null
    if (game && game.status === 'ready') showGame(game)
    else showLanding()
  }

  function navigate(to: string): void {
    const next = `#${to}`
    if (window.location.hash === next) route()
    else window.location.hash = next
  }

  window.addEventListener('hashchange', route)
  route()

  // Keep the deck reachable from the keyboard alone, from anywhere.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !event.shiftKey) return
    event.preventDefault()
    navigate('/')
  })

  console.info(
    `Braino Games — ${GAMES.filter((g) => g.status === 'ready').length} playable`,
  )
}
