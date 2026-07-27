# Tangent — v0.1 Specification

> **Vocabulary note.** v0.3 renamed this document's "level" to **round**,
> and reused "level" for the evolutionary tier. This file has been updated
> to the new term. The **Scoring** and **Leaderboard** sections below are
> superseded by [`SPEC-v0.3.md`](SPEC-v0.3.md) and
> [`SPEC-v0.2.md`](SPEC-v0.2.md).

## Concept

Watch a sequence. Repeat it. It grows by one every round. A miss costs a
life; three misses and the run ends.

Round 1 is one input. Round 7 is seven. There is no upper bound — the
game ends when you do.

---

## Modes

| Mode | Symbols | Entropy/step | Notes |
|------|---------|--------------|-------|
| **Arrows** | `up`, `down`, `left`, `right` | 2 bits | Rendered as the standard inverted-T key cluster |
| **Clicks** | `left`, `right` | 1 bit | Two large pads |

Clicks mode is deliberately lower-entropy. A round-10 arrow sequence is
much harder than a round-10 click sequence, so **leaderboards are per
mode and never merged**. Don't "fix" this by averaging them.

---

## Round flow

```
menu → [pick mode] → playback → input → result
                       ↑ ↑                 │
                       │ └──── correct ────┤
                       │                   │
                       └── life left ── wrong
                                           │
                                    out of lives → gameover → retry
```

1. **Playback** — symbols flash one at a time, each with its own tone.
   Input is locked and visibly so.
2. **Input** — player reproduces the sequence. Each correct input gives
   immediate feedback (flash + tone). No confirmation step.
3. **Result** — correct: brief success cue, next round starts in ~600ms
   with the same sequence plus one new symbol appended. Wrong: fail cue,
   one life spent, and the *same* round replays from playback. On the
   third miss the run ends and the gameover screen appears.

**The sequence is append-only.** Round 4 is round 3's sequence plus one.
This is what makes it trainable — regenerating from scratch each round
would test short-term memory instead of muscle memory.

---

## Lives

A run has three. They do not regenerate — clearing rounds does not buy
them back, so a run is bounded by three mistakes however long it lasts.

The replayed round keeps its sequence. Regenerating it after a miss
would hand the player a fresh string to memorise instead of another go
at the pattern they just lost, which is the opposite of drilling.

Lives are a run-wide counter and never enter the leaderboard entry.

---

## Timing

Speed scales with the round so early rounds don't drag and late rounds
bite.

```
flashMs = clamp(520 - 25 * (round - 1), 180, 520)
gapMs   = flashMs * 0.35
```

- Round 1: 520ms flash, 182ms gap
- Round 8: 345ms / 121ms
- Round 15+: floored at 180ms / 63ms (the formula, not the table, is
  authoritative — round 14 is still 195ms)

No per-input timeout in v0.1. Thinking time is free; only accuracy ends
the round.

---

## Scoring

> Superseded by [`SPEC-v0.3.md`](SPEC-v0.3.md): points are now primary,
> then level, then rounds, then reaction time.

- **Primary**: rounds cleared
- **Tiebreak**: lower average reaction time across the whole run

Reaction time = ms between the previous input (or end of playback, for
the first) and the current keypress.

---

## Leaderboard

> Superseded by [`SPEC-v0.2.md`](SPEC-v0.2.md) (global, time windows) and
> [`SPEC-v0.3.md`](SPEC-v0.3.md) (points, levels, rounds).

Per mode, top 20. Nickname 2–12 chars, submitted after a run.

Each entry stores:

| Field | Purpose |
|-------|---------|
| `nickname` | player-chosen |
| `mode` | arrows / clicks |
| `rounds` | rounds cleared (was `level` before v0.3) |
| `avgReactionMs` | tiebreak + stat |
| `fastestInputMs` | fun stat |
| `totalInputs` | fun stat |
| `achievedAt` | ISO timestamp, shown as relative + absolute |
| `runDurationMs` | fun stat |

Fun derived labels to show next to entries — pick from these based on the
run's stats: *"reflex demon"* (avg under 250ms), *"the deliberator"* (avg
over 900ms), *"night shift"* (achieved 00:00–05:00 local), *"one and
done"* (first run of the session), *"marathon"* (run over 90 seconds).

**v0.1 is localStorage only.** It is not global and the UI should be
honest about that — label it "Local best" rather than implying otherwise.
The `LeaderboardProvider` interface exists so v0.2 can swap in a remote
backend without touching the game code.

---

## Visual direction

Loud, saturated, arcade. Not a corporate dashboard.

- Deep near-black background so the pads pop
- One vivid color per symbol, consistent everywhere (pad, flash, tone
  association, leaderboard accents)
- Chunky rounded pads with a real pressed state
- Motion: fast scale + glow on flash, screen shake on failure
- Respect `prefers-reduced-motion` — swap shake and scale for opacity

Suggested palette (adjust freely):
`up` #f9e2af · `down` #a6e3a1 · `left` #89b4fa · `right` #f38ba8 ·
click-left #cba6f7 · click-right #fab387

---

## Audio

Web Audio API, generated tones. No files.

One pitch per symbol, held for the flash duration. Tones are not
decoration — pairing sound with motion measurably helps sequence recall,
which is the entire point of the game. Mute toggle persists to
localStorage.

---

## Input handling — the traps

These are the things that will bite during implementation:

1. **Arrow keys scroll the page.** `preventDefault` on keydown.
2. **Right-click opens the context menu.** `preventDefault` on
   `contextmenu` for the whole play area.
3. **Repeated symbols look like one long flash.** Insert the gap *before*
   re-triggering, or restart the CSS animation explicitly.
4. **Key repeat fires on hold.** Ignore events where `event.repeat` is
   true.
5. **Mouse mode needs `mousedown`, not `click`** — `click` won't
   distinguish buttons reliably and feels laggy.
6. **Playback timers must be cancellable.** If the player retries
   mid-playback, stale timeouts will flash symbols into the new round.
7. **Focus loss mid-round** — pause or fail cleanly on `blur`, don't
   leave the engine in a stuck state.

---

## Out of scope for v0.1

Explicitly deferred. Do not build these:

- Global/remote leaderboard (v0.2)
- Accounts, auth, sessions
- Additional modes (WASD, numpad, colors, mixed)
- Difficulty settings or speed selection
- Mobile touch support
- Anti-cheat — localStorage scores are trivially editable, and that is
  acceptable for v0.1
- PWA / offline install
- Analytics

---

## Definition of done for v0.1

- [x] Both modes playable start to finish
- [x] Fully playable keyboard-only; fully playable mouse-only
- [x] Retry from gameover in one input
- [x] Local leaderboard writes, reads, sorts, and displays per mode
- [x] Tones play, mute toggle persists
- [x] `npm run build` clean, `npm run typecheck` clean
- [ ] No console errors across a full run in both modes
