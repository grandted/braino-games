/**
 * Braino Games — platform entry.
 *
 * Bootstrapping only: find the mount point, build the shared services, hand
 * them to the shell. Everything else lives in `platform/` or in a game.
 */

import './styles/base.css'
import './styles/platform.css'
import './games/tangent/styles/board.css'
import './games/tangent/styles/screens.css'
import './games/tangent/styles/helix.css'

import { createShell } from './platform/shell.ts'
import { createLeaderboard } from './shared/leaderboard/index.ts'
import { registerServiceWorker } from './platform/pwa.ts'
import { blockZoomGestures } from './platform/zoom.ts'

function mountPoint(): HTMLElement {
  const element = document.querySelector<HTMLDivElement>('#app')
  if (!element) throw new Error('#app is missing from index.html')
  return element
}

// Before the shell: the listeners are on `document` and cost nothing, and a
// gesture during the first paint is as unwelcome as one mid-round.
blockZoomGestures()

createShell({
  container: mountPoint(),
  leaderboard: createLeaderboard(),
})

registerServiceWorker()
