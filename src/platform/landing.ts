/**
 * The deck.
 *
 * One card per game, dealt in on load. A card carries the game's own hue, so
 * the deck reads as one platform holding several distinct things rather than
 * three copies of the same panel.
 */

import { readBest } from '../shared/leaderboard/index.ts'
import { GAMES } from './registry.ts'
import type { GameDefinition } from './types.ts'

export interface Landing {
  readonly element: HTMLElement
  destroy(): void
}

export function createLanding(onOpen: (game: GameDefinition) => void): Landing {
  const element = document.createElement('section')
  element.className = 'landing'

  const header = document.createElement('header')
  header.className = 'masthead'

  const title = document.createElement('h1')
  title.className = 'masthead__title'
  // Split so the two words can be styled and animated independently.
  title.innerHTML = '<span>Mind</span><span>Games</span>'

  const rule = document.createElement('span')
  rule.className = 'masthead__rule'

  const subtitle = document.createElement('p')
  subtitle.className = 'masthead__subtitle'
  subtitle.textContent = 'Small games for a sharp head. Pick a card.'

  header.append(title, rule, subtitle)

  const deck = document.createElement('div')
  deck.className = 'deck'

  const cards = GAMES.map((game, index) => createCard(game, index, onOpen))
  for (const card of cards) deck.append(card)

  const footer = document.createElement('p')
  footer.className = 'landing__footer'
  footer.textContent = `${GAMES.filter((g) => g.status === 'ready').length} of ${GAMES.length} dealt`

  element.append(header, deck, footer)

  return {
    element,
    destroy() {
      element.remove()
    },
  }
}

function createCard(
  game: GameDefinition,
  index: number,
  onOpen: (game: GameDefinition) => void,
): HTMLElement {
  const playable = game.status === 'ready'

  const card = document.createElement(playable ? 'button' : 'div')
  card.className = playable ? 'card' : 'card card--facedown'
  card.style.setProperty('--game-hue', String(game.card.hue))
  // Deals in staggered, so the deck lands rather than appears.
  card.style.setProperty('--deal', String(index))
  if (card instanceof HTMLButtonElement) {
    card.type = 'button'
    card.addEventListener('click', () => onOpen(game))
  } else {
    card.setAttribute('aria-disabled', 'true')
  }

  const face = document.createElement('span')
  face.className = 'card__face'

  const emblem = game.card.renderEmblem()

  const name = document.createElement('span')
  name.className = 'card__name'
  name.textContent = game.name

  const tagline = document.createElement('span')
  tagline.className = 'card__tagline'
  tagline.textContent = game.card.tagline

  const blurb = document.createElement('span')
  blurb.className = 'card__blurb'
  blurb.textContent = game.card.blurb

  face.append(emblem, name, tagline, blurb)

  if (playable) {
    const best = bestAcrossModes(game)
    const footer = document.createElement('span')
    footer.className = 'card__footer'
    footer.textContent =
      best === null ? 'Not played yet' : `Your best · ${best.toLocaleString()}`
    face.append(footer)

    const cue = document.createElement('span')
    cue.className = 'card__cue'
    cue.textContent = 'Play'
    face.append(cue)
  }

  card.append(face)
  return card
}

/** The best score this player has on any of the game's modes. */
function bestAcrossModes(game: GameDefinition): number | null {
  let best: number | null = null
  for (const mode of game.modeKeys) {
    const record = readBest(game.id, mode)
    if (record && (best === null || record.points > best)) best = record.points
  }
  return best
}
