# Tangent — v0.2 Specification

Global leaderboard and phone play. v0.1 (`SPEC.md`) still describes the
game itself; nothing about the rules, timing or scoring changed here.

---

## Global leaderboard

Scores live on a server and are shared by everyone who plays that
server. **The localStorage board is gone** — not kept as a fallback, not
migrated. One board, one answer to "what is the record".

The consequence is deliberate and must stay visible in the UI: with no
network there is no leaderboard. An unreachable board says so, and
never renders as an empty one — "nobody has played yet" and "we can't
reach the server" look identical otherwise, and only one of them is
true.

### Stack

`node:http` and `node:sqlite`, run straight from TypeScript by Node's
type stripping. No framework, no ORM, no build step, and no runtime
dependencies — the same rule the client follows.

In production one process serves both `/api` and the built client from
`dist/`, so there is a single origin and no CORS. In development Vite
proxies `/api` to it.

### API

```
GET  /api/leaderboard?mode=arrows&window=week   -> { mode, window, entries }
POST /api/leaderboard                            -> { entry, rank }
GET  /api/health                                 -> { ok }
```

`id` and `achievedAt` are assigned by the server. The clock is the
server's; a client cannot backdate a run into a quieter window.

### Time windows

The board is sliceable, because a board only showing all-time records is
one a newcomer can never appear on:

| Window | Meaning |
|--------|---------|
| `24h` | last 24 hours |
| `week` | last 7 days |
| `month` | last 30 days |
| `all` | everything |

`week` is the default. A run submitted just now opens the board on
`24h`, which is guaranteed to contain it.

Windows filter on `achievedAt` and never change the ranking rule:
level descending, then average reaction ascending, then oldest first.
Boards stay **per mode** — that rule from v0.1 is unchanged.

### Verification

Light server-side checks. This is not anti-cheat and does not pretend to
be — a carefully-shaped lie still gets through, which is accepted, as it
was in v0.1. What it rejects is runs whose own numbers contradict each
other, which is what casual forgery and broken clients actually produce:

- nickname normalised and length-checked, invisibles stripped
- `level` within 1..500
- `totalInputs` at least `level * (level + 1) / 2` — you cannot clear
  level N having entered fewer symbols than that
- reaction times within human range, `fastestInputMs <= avgReactionMs`
- `runDurationMs` at least as long as the playbacks of levels 1..N take,
  derived from the game's own timing curve in `game/modes.ts`
- rate limit per address, 20 submissions per 10 minutes
- 4KB body cap

The floors come from the shared timing module on purpose. A rule that
restates the game's constants in the server would drift the first time
someone tunes the curve.

---

## Mobile play

The game is playable on a phone. There is no separate mobile build and
no device sniffing — layout responds to `(pointer: coarse)` and input
responds to the pointer type of each individual event, so a hybrid
laptop behaves correctly with either input mid-round.

### Virtual controls

The pad *is* the controller, and what it means depends on the mode you
picked:

- **Arrows** — the four pads are the arrow keys, in the usual inverted-T,
  sized for thumbs and sunk to the bottom of the screen.
- **Clicks** — the two pads are the two mouse buttons. Left pad is left
  click, right pad is right click.

### A touch is not a mouse

With a mouse in clicks mode the *button* is the symbol, anywhere in the
play area. A touchscreen has no second button, so a tap resolves to
whichever *pad* it landed on instead. Without this, every tap in clicks
mode would be a left click and the mode would be unplayable on a phone.

The rule is one pure function — `resolvePointer()` in `ui/board.ts`.

### Touch traps

- `touch-action: none` on the pads: a tap is an input, never a scroll or
  a zoom.
- `touch-action: manipulation` on the body kills double-tap zoom while
  leaving pinch zoom alone, since that one is an accessibility
  affordance.
- `overscroll-behavior: none`: pull-to-refresh mid-round is a lost round.
- `100svh`, never `dvh` — the pads must not jump when browser chrome
  slides away.
- `viewport-fit=cover` plus `env(safe-area-inset-bottom)`, so the bottom
  row of pads clears the home indicator.
- Hints are written twice, keyboard and touch. Telling a phone player to
  press escape is worse than saying nothing.

---

## Definition of done for v0.2

- [x] Scores submit to and read from the server
- [x] Board filters by 24h / week / month / all time, per mode
- [x] localStorage leaderboard removed
- [x] Unreachable board is distinguishable from an empty one, and retries
- [x] Implausible runs rejected; rate limit and body cap enforced
- [x] One process serves API and client on one origin
- [x] Both modes playable by touch, controls matching the chosen mode
- [x] `npm run build` clean, `npm run typecheck` clean (client + server)
- [ ] Played on a real phone
