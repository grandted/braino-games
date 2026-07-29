/**
 * Zoom, and why there isn't any.
 *
 * Knows no game — this is the shell's business, the same for every card in
 * the deck.
 *
 * A game laid out to fill the viewport exactly has nothing to zoom *to*, and
 * both gestures cost rounds instead: a pinch mid-sequence leaves the pads
 * half off screen, and two quick taps — which is simply how you enter a
 * repeated symbol — read as a double-tap zoom.
 *
 * Three things are needed, because no single one of them works everywhere:
 *
 *   1. `maximum-scale=1` in the viewport meta (index.html). Android honours
 *      it. iOS has ignored it since iOS 10, on purpose.
 *   2. `touch-action: manipulation` on everything tappable, and `none` on the
 *      play area (base.css, board.css, screens.css). This is what stops the
 *      *double-tap*, on every engine including Safari.
 *   3. What's below: WebKit's non-standard gesture events, which are the only
 *      handle iOS gives you on a *pinch*. They fire on Safari and nowhere
 *      else, so on every other engine this is dead weight and no risk.
 *
 * The accessibility trade this makes is real, and it is why the app is
 * legible without zoom: text scales with the viewport rather than sitting at
 * a fixed size, the pads are the largest thing that fits, and nothing depends
 * on reading fine print. Browser and OS text-size settings still apply.
 */

/** WebKit-only. Not in lib.dom, hence the name list rather than a type. */
const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const

export function blockZoomGestures(): void {
  for (const name of GESTURES) {
    // Passive would make preventDefault a no-op, and that is the whole point.
    document.addEventListener(name, (event) => event.preventDefault(), {
      passive: false,
    })
  }

  // Safari's other way in: a pinch that starts as two touches inside a
  // scrollable region. `touchmove` with more than one point is never
  // something this app wants — every input it takes is a single tap.
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault()
    },
    { passive: false },
  )
}
