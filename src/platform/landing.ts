/**
 * The deck.
 *
 * One card per game, dealt in on load. A card carries the game's own hue, so
 * the deck reads as one platform holding several distinct things rather than
 * three copies of the same panel.
 */

import { readBest } from '../shared/leaderboard/index.ts'
import { createInstallBanner } from './pwa.ts'
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
  // Split so the lockup can be styled as two lines rather than one long one.
  title.innerHTML = '<span>Braino</span><span>Games</span>'

  const rule = document.createElement('span')
  rule.className = 'masthead__rule'

  const subtitle = document.createElement('p')
  subtitle.className = 'masthead__subtitle'
  subtitle.textContent = 'braino.games — small games for a sharp head'

  header.append(title, rule, subtitle)

  const deck = document.createElement('div')
  deck.className = 'deck'

  const cards = GAMES.map((game, index) => createCard(game, index, onOpen))
  for (const card of cards) deck.append(card)

  const ready = GAMES.filter((game) => game.status === 'ready').length
  const footer = document.createElement('p')
  footer.className = 'landing__footer'
  footer.textContent = `${ready} of ${GAMES.length} dealt · more on the way`

  element.append(header, deck, footer)

  // Only ever on the deck: an install banner over a running game would be a
  // dialog in the middle of a round.
  const install = createInstallBanner()
  if (install) element.append(install.element)

  return {
    element,
    destroy() {
      install?.destroy()
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

  // Built in the branch rather than created generically and then inspected:
  // a playable card is a real button, and one that isn't should not pretend.
  let card: HTMLElement
  if (playable) {
    const button = document.createElement('button')
    button.type = 'button'
    button.addEventListener('click', () => onOpen(game))
    card = button
  } else {
    const panel = document.createElement('div')
    panel.setAttribute('aria-disabled', 'true')
    card = panel
  }

  card.className = playable ? 'card' : 'card card--facedown'
  card.style.setProperty('--game-hue', String(game.card.hue))
  // Deals in staggered, so the deck lands rather than appears.
  card.style.setProperty('--deal', String(index))
  card.classList.add('is-dealing')
  // The deal is removed once it has run. A finished animation with a fill mode
  // keeps its last frame applied and outranks author rules, so leaving it on
  // would pin `transform: none` and silently defeat every hover and tilt.
  card.addEventListener(
    'animationend',
    () => card.classList.remove('is-dealing'),
    { once: true },
  )

  // The art gets its own panel across the top. Nothing is ever drawn behind
  // the text: a wash over artwork is a compromise, and the words lose.
  const art = document.createElement('span')
  art.className = 'card__art'
  art.setAttribute('aria-hidden', 'true')
  try {
    art.append(game.card.renderBackdrop())
  } catch (error) {
    // Card art is scenery. A game that cannot draw its own backdrop should
    // still be playable from a plain card rather than taking the deck down.
    console.warn(`${game.id}: card art failed to render`, error)
  }

  const body = document.createElement('span')
  body.className = 'card__body'

  const heading = document.createElement('span')
  heading.className = 'card__heading'
  heading.append(game.card.renderEmblem())

  const name = document.createElement('span')
  name.className = 'card__name'
  name.textContent = game.name
  heading.append(name)

  const tagline = document.createElement('span')
  tagline.className = 'card__tagline'
  tagline.textContent = game.card.tagline

  const blurb = document.createElement('span')
  blurb.className = 'card__blurb'
  blurb.textContent = game.card.blurb

  body.append(heading, tagline, blurb)

  if (playable) {
    const meta = document.createElement('span')
    meta.className = 'card__meta'

    const best = bestAcrossModes(game)
    const footer = document.createElement('span')
    footer.className = 'card__footer'
    footer.textContent =
      best === null ? 'Not played yet' : `Best ${best.toLocaleString()}`

    const cue = document.createElement('span')
    cue.className = 'card__cue'
    cue.textContent = 'Play'

    meta.append(footer, cue)
    body.append(meta)
  }

  card.append(art, body)
  if (playable) attachTilt(card)
  return card
}

/**
 * Tilts a card toward the pointer, with the face's layers at different depths
 * so they part as it turns.
 *
 * Mouse only, and only where hovering is possible: on a touchscreen there is no
 * pointer to follow, and a tilt that fires on tap would just be a flinch.
 */
function attachTilt(card: HTMLElement): void {
  // Decorative, so it must never be load-bearing: if the environment cannot
  // answer the question, the card simply does not tilt.
  if (typeof window.matchMedia !== 'function') return
  if (!window.matchMedia('(hover: hover)').matches) return

  // Measured once on entry rather than on every move — reading layout inside a
  // pointermove handler is how a smooth effect turns into a janky one.
  let bounds: DOMRect | null = null

  card.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return
    bounds = card.getBoundingClientRect()
  })

  card.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !bounds) return
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    card.style.setProperty('--tilt-y', x.toFixed(3))
    card.style.setProperty('--tilt-x', (-y).toFixed(3))
  })

  const settle = (): void => {
    bounds = null
    card.style.setProperty('--tilt-x', '0')
    card.style.setProperty('--tilt-y', '0')
  }
  card.addEventListener('pointerleave', settle)
  // A card can lose the pointer without a leave event — on scroll, or when the
  // shell swaps the view out from under it.
  card.addEventListener('pointercancel', settle)
  card.addEventListener('blur', settle)
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
