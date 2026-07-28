/**
 * The last nickname used, remembered on this machine.
 *
 * Scores are global now and nothing about them is stored locally, but the
 * nickname is not a score — it's what lets a mouse-only player submit by
 * clicking Save without ever reaching for the keyboard.
 */

const STORAGE_KEY = 'tangent:nickname'

export function readLastNickname(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    // Storage blocked (private mode, disabled cookies). Type it each time.
    return ''
  }
}

export function rememberNickname(nickname: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, nickname)
  } catch {
    // Not fatal — the submission itself doesn't depend on this.
  }
}
