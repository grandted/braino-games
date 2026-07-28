/**
 * Guards shared by every global key handler in the game.
 *
 * The game listens for keys on `window`, because a player should be able to
 * hit a pad without first clicking to focus something. That is the right call
 * for a game and the wrong one for a text field: the nickname box on the
 * gameover screen is a `window` keydown away from every shortcut in the app,
 * and `m` was being eaten by the mute toggle before it ever reached the input.
 *
 * So: a keystroke that belongs to a text field is not a shortcut, and a
 * keystroke carrying a modifier is a browser shortcut rather than ours.
 */

/**
 * True when the keystroke is going into somewhere the player is typing —
 * an input, a textarea, a select, or any contenteditable region.
 *
 * Reads `event.target` rather than `document.activeElement`: for a keydown
 * raised inside a field the target *is* that field, which stays correct even
 * mid-focus-change.
 */
export function isTypingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * True when the key is part of a browser shortcut — Ctrl+W, Cmd+R, Alt+Tab.
 * Shift is deliberately absent: it is how you type a capital letter.
 */
export function hasShortcutModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

/**
 * The single question every global key handler should ask first: is this
 * keystroke mine to act on?
 */
export function isGameKeystroke(event: KeyboardEvent): boolean {
  return !isTypingInto(event.target) && !hasShortcutModifier(event)
}
