/**
 * Installed-app wiring.
 *
 * Knows no game — this is the shell's business, the same for every card in
 * the deck. See `public/sw.js` for what actually gets cached.
 */

/**
 * Register the service worker, which is what makes the app launch offline.
 *
 * Production only. In dev, Vite serves each module unbundled and unhashed, so
 * a worker caching them hands you yesterday's code and a mystery to go with
 * it. Registration also fails outright on an insecure origin, which is the
 * normal way to test on a phone over the LAN — that is not an error worth
 * shouting about, so it goes quietly.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  // After load: registration competes with the first paint for bandwidth
  // otherwise, and the first visit is the one that has nothing cached.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

/* Install ------------------------------------------------------------------
 *
 * Being installable is worth nothing if nobody is told. Chrome offers an
 * event and its own tucked-away menu item; iOS offers neither and expects the
 * user to know about Share → Add to Home Screen. So: one banner, two paths.
 */

const DISMISSED_KEY = 'braino:install-dismissed'

/** The non-standard event Chromium fires when it would offer an install. */
type InstallPromptEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const waiting = new Set<() => void>()

// At module scope on purpose: the event fires early, often before the deck
// exists, and it is only offered once. Miss it and there is no second chance.
window.addEventListener('beforeinstallprompt', (event) => {
  // Suppress Chrome's own mini-infobar; the banner below replaces it.
  event.preventDefault()
  deferred = event as InstallPromptEvent
  for (const notify of waiting) notify()
})

window.addEventListener('appinstalled', () => {
  deferred = null
  remember()
})

function remember(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Private mode with storage denied. Showing the banner again next visit
    // is a far smaller problem than failing to render the deck.
  }
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Already running from a home screen, by either the standard or iOS's way. */
function installed(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  const legacy = navigator as Navigator & { standalone?: boolean }
  return legacy.standalone === true
}

/**
 * Safari on an iPhone or iPad — the only browser there that can install, and
 * the one with no API for it. iPadOS claims to be a Mac, hence the touch
 * check; Chrome and Firefox on iOS carry their own tokens and cannot install.
 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent
  const ios =
    /iphone|ipod|ipad/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  return ios && !/crios|fxios|edgios/i.test(ua)
}

export interface InstallBanner {
  readonly element: HTMLElement
  destroy(): void
}

/**
 * The banner, or null when there is nothing to offer: already installed,
 * already dismissed, or a browser that cannot install at all.
 *
 * On Chromium it stays hidden until the browser says the app qualifies, so it
 * never promises an install that would fail.
 */
export function createInstallBanner(): InstallBanner | null {
  if (installed() || dismissed()) return null

  const ios = isIosSafari()
  if (!ios && !('onbeforeinstallprompt' in window)) return null

  const element = document.createElement('aside')
  element.className = 'install'
  if (!ios) element.hidden = deferred === null

  const text = document.createElement('p')
  text.className = 'install__text'
  text.textContent = ios
    ? 'Add to your home screen: tap Share, then Add to Home Screen.'
    : 'Install Braino — full screen, and it plays offline.'

  const close = document.createElement('button')
  close.className = 'install__dismiss'
  close.type = 'button'
  close.textContent = '×'
  close.setAttribute('aria-label', 'Dismiss')
  close.addEventListener('click', () => {
    remember()
    element.remove()
  })

  element.append(text)

  if (!ios) {
    const go = document.createElement('button')
    go.className = 'btn install__go'
    go.type = 'button'
    go.textContent = 'Install'
    go.addEventListener('click', () => {
      const prompt = deferred
      if (!prompt) return
      // One shot: the event cannot be re-prompted, so drop it either way.
      deferred = null
      go.disabled = true
      void prompt.prompt().then(() => prompt.userChoice.then(() => element.remove()))
    })
    element.append(go)
  }

  element.append(close)

  const reveal = (): void => {
    element.hidden = false
  }
  waiting.add(reveal)

  return {
    element,
    destroy() {
      waiting.delete(reveal)
      element.remove()
    },
  }
}
