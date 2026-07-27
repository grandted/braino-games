/**
 * In-memory fixed-window rate limiter, keyed by client address.
 *
 * Single process, so a Map is the whole implementation. If this ever runs
 * behind more than one instance the limits become per-instance — fine for
 * what they defend against, which is one script hammering the board.
 */

export interface RateLimit {
  /** True when the caller is within its allowance. Records the hit. */
  check(key: string): boolean
}

export function createRateLimit(limit: number, windowMs: number): RateLimit {
  const hits = new Map<string, number[]>()
  let lastSweep = Date.now()

  return {
    check(key) {
      const now = Date.now()

      // Amortised cleanup: without this the Map grows for every address seen.
      if (now - lastSweep > windowMs) {
        for (const [seen, times] of hits) {
          if (times.every((at) => now - at > windowMs)) hits.delete(seen)
        }
        lastSweep = now
      }

      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(now)
      hits.set(key, recent)
      return true
    },
  }
}
