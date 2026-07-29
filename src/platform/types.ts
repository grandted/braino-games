/**
 * The contract between Braino Games and a game.
 *
 * Two rules hold the platform together, and everything else follows:
 *
 *   1. **The shell knows no game.** It reads `registry.ts` and calls `mount()`.
 *      Nothing in `platform/` imports anything from `games/`.
 *   2. **A game knows no shell.** It is handed a container and a context and
 *      does what it likes inside them. Nothing in a game imports from
 *      `platform/`, except this file for its own type.
 *
 * Adding a game means writing a `GameDefinition` and putting it in the
 * registry. Nothing else on the platform changes.
 */

import type { LeaderboardProvider } from '../shared/leaderboard/index.ts'

/** What a game is handed when it starts. */
export interface GameContext {
  /**
   * Leave the game and return to the deck. A game calls this from its own
   * quit affordance; the shell also offers one, so a game never has to.
   */
  readonly exit: () => void
  /**
   * The shared board. Already scoped by game id when the game submits, so a
   * game never has to think about the other games' scores.
   */
  readonly leaderboard: LeaderboardProvider
}

/** A running game. The shell holds one of these at a time. */
export interface GameHandle {
  /** Tear everything down: listeners, timers, audio, DOM. */
  destroy(): void
}

/** How a game presents itself on the deck. */
export interface GameCard {
  /** Short line under the title. */
  readonly tagline: string
  /** A sentence or two, for the back of the card. */
  readonly blurb: string
  /**
   * The game's signature hue. Drives its card, and is what makes one game
   * visibly a different game while still belonging to the same platform.
   */
  readonly hue: number
  /** Drawn on the card face. Given the card's colour to work with. */
  renderEmblem(): HTMLElement
  /**
   * Art for the card's background — a glimpse of the game itself, so a card
   * looks like the thing it opens rather than like a coloured panel.
   *
   * Must be **inert**: no timers, no listeners, no work after it is returned.
   * CSS animation is fine. That requirement is what lets the platform treat
   * card art as scenery it can drop on the floor without a teardown call.
   */
  renderBackdrop(): HTMLElement
}

export interface GameDefinition {
  /** Stable and permanent: it keys the leaderboard and the URL. */
  readonly id: string
  readonly name: string
  readonly card: GameCard
  /** Games still being built show as face-down cards and cannot be opened. */
  readonly status: 'ready' | 'soon'
  /** Modes whose personal bests the card should show. */
  readonly modeKeys: readonly string[]
  mount(container: HTMLElement, context: GameContext): GameHandle
}
