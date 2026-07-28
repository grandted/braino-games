/**
 * Every game on the platform.
 *
 * This is the only file that changes when a game is added. The shell renders
 * whatever is here; nothing else on the platform knows a game by name.
 *
 * Games marked `soon` show as face-down cards on the deck and cannot be
 * opened — they exist so the deck reads as a deck rather than as one game
 * with empty space around it.
 */

import { tangent } from '../games/tangent/index.ts'
import type { GameDefinition } from './types.ts'

/** A placeholder slot: a card that is face down because there is no game yet. */
function comingSoon(id: string, hue: number, blurb: string): GameDefinition {
  return {
    id,
    name: 'Coming soon',
    status: 'soon',
    modeKeys: [],
    card: {
      tagline: 'Not dealt yet',
      blurb,
      hue,
      renderEmblem() {
        const emblem = document.createElement('span')
        emblem.className = 'emblem emblem--facedown'
        emblem.textContent = '?'
        return emblem
      },
      renderBackdrop() {
        const art = document.createElement('span')
        art.className = 'facedown-art'
        return art
      },
    },
    mount() {
      throw new Error(`${id} is not playable yet`)
    },
  }
}

export const GAMES: readonly GameDefinition[] = [
  tangent,
  comingSoon('slot-2', 190, 'The second game is still being built.'),
  comingSoon('slot-3', 130, 'And there is room for a third.'),
]

export function findGame(id: string): GameDefinition | null {
  return GAMES.find((game) => game.id === id) ?? null
}
