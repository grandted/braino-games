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

function mountPoint(): HTMLElement {
  const element = document.querySelector<HTMLDivElement>('#app')
  if (!element) throw new Error('#app is missing from index.html')
  return element
}

createShell({
  container: mountPoint(),
  leaderboard: createLeaderboard(),
})

registerServiceWorker()
