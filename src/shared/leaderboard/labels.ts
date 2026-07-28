/**
 * The fun labels shown beside an entry. Pure functions over a stored entry —
 * no DOM, no provider.
 *
 * "One and done" is the odd one out: whether a run was the session's first
 * isn't recoverable from a stored entry, so the caller passes it in for the
 * run it just submitted and nothing else claims it.
 */

import type { Entry } from './types.ts'

export interface LabelContext {
  readonly firstRunOfSession?: boolean
}

export function labelsFor(entry: Entry, context: LabelContext = {}): string[] {
  const labels: string[] = []

  if (entry.avgReactionMs > 0 && entry.avgReactionMs < 250) {
    labels.push('reflex demon')
  }
  if (entry.avgReactionMs > 900) labels.push('the deliberator')

  const hour = new Date(entry.achievedAt).getHours()
  if (hour >= 0 && hour < 5) labels.push('night shift')

  if (context.firstRunOfSession) labels.push('one and done')
  if (entry.runDurationMs > 90_000) labels.push('marathon')

  return labels
}

/** "3 minutes ago" — paired with the absolute time, never replacing it. */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  const units: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ]

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit)
    }
  }
  return format.format(Math.round(seconds), 'second')
}

/** Absolute time, local to the reader. */
export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
