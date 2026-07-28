# CLAUDE.md

Context for Claude Code. Read this before making changes.

## What this is

**Tangent** — a browser-based muscle-memory game. A sequence of inputs is
shown, the player repeats it, the sequence grows by one each round. Three
modes: arrow keys (4 symbols), mouse buttons (2), and a 3×3 grid (9).

Adding a mode means adding a `ModeDef` to `game/modes.ts` and a layout to
`styles/board.css`. Everything that enumerates modes — menu cards, digit
shortcuts, leaderboard tabs, personal bests, server validation, the
database — reads `MODES` and extends on its own. Keep it that way.

## Vocabulary — read this before touching anything

v0.3 renamed the core noun. **Everything called `level` before v0.3 is now
called `round`**, and `level` now means something else entirely. Git
history, old commit messages and your instincts are all misleading here.

| Term | Meaning |
|------|---------|
| **round** | one sequence reproduction; round N has N symbols. Was `level`. |
| **level** | evolutionary tier — the organism whose genome is being solved |
| **base pair** | one correct input; bonds one rung of the organism's genome |
| **genome** | base pairs needed to finish the current level |
| **points** | score; rewards clearing rounds quickly. Primary board measure. |

Levels complete on round boundaries (see `game/evolution.ts`), so level is
a pure function of rounds cleared. It is a milestone and a display band,
not an independent ranking signal — points are what separate the board.

Training goal for the player: pattern chunking and motor recall. Design
goal for us: **zero friction**. Open page → play in under 3 seconds, fail
→ retry with one key or click.

## Stack

- **Vite + TypeScript**, no UI framework
- Vanilla DOM + CSS custom properties
- Web Audio API for tones (generated, no asset files)
- **Server**: `node:http` + `node:sqlite`, run straight from TypeScript via
  Node's type stripping. No framework, no ORM, no build step.
- No runtime dependencies, client or server. Keep it that way unless
  there's a strong reason. `@types/node` is dev-only.

Why no React: this is a timing-sensitive game loop driven by discrete
input events. Direct DOM writes are simpler here than reconciliation, and
the whole UI is about six elements.

## Commands

```bash
npm run dev         # vite dev server, port 5173 (proxies /api to 8787)
npm run dev:server  # leaderboard server on 8787, --watch
npm run build       # production build to dist/
npm run serve       # node server: API + dist/ on one origin, port 8787
npm run start       # build, then serve
npm run typecheck   # tsc for the client and the server
```

Development wants **both** `npm run dev` and `npm run dev:server` running.
Vite proxies `/api` to the Node server, so the browser only ever talks to
one origin and there is no CORS anywhere.

Production is a single process: `npm run start` builds the client and
serves it alongside the API from port 8787.

Dev server runs inside WSL2; reach it from Windows at
`http://localhost:5173`. If localhost forwarding misbehaves, use
`npm run dev -- --host` and hit the WSL IP. Playing on a phone on the
same network needs `--host` too.

Server environment variables: `TANGENT_PORT` (8787), `TANGENT_DB`
(`data/tangent.db`), `TANGENT_STATIC` (`dist`), `TANGENT_TRUST_PROXY`
(set to `1` only when something in front actually rewrites
`x-forwarded-for` — a client can otherwise spoof it and dodge the rate
limit).

## Architecture

```
src/
├── main.ts              entry, wires screens together
├── game/
│   ├── engine.ts        state machine: idle→playback→input→result
│   ├── sequence.ts      generation + validation
│   ├── evolution.ts     the organism ladder: genomes, tiers, names
│   ├── scoring.ts       points per round, evolution bonus, server ceiling
│   └── modes.ts         mode definitions (symbols, keybinds, colors),
│                        plus TIMING, RULES and SCORING — every tunable
├── ui/
│   ├── screens.ts       menu / game / gameover / leaderboard
│   ├── board.ts         renders the pad, flash animation, all input
│   ├── helix.ts         the 3D DNA strand (genome progress)
│   └── audio.ts         synthesis, mix chain, reverb, ambient bed
├── leaderboard/
│   ├── types.ts         Provider interface, Entry, windows, shared rules
│   ├── remote.ts        HTTP provider against /api (v0.2)
│   ├── labels.ts        derived entry labels + time formatting
│   ├── nickname.ts      remembers the last nickname locally
│   ├── personal.ts      your own record per mode, on this device
│   └── index.ts         provider selection
└── styles/

server/
├── index.ts             node:http — /api + serves dist/
├── db.ts                node:sqlite storage
├── validate.ts          plausibility checks on submitted runs
└── rateLimit.ts         in-memory fixed-window limiter
```

**`leaderboard/personal.ts` is not a leaderboard.** It is the arcade
cabinet's "your best", kept on the device. There is still exactly one
board, it is global, and it lives on the server — v0.2's decision stands.

**The leaderboard is behind an interface on purpose.** v0.2 swapped the
localStorage provider for a remote one and only `leaderboard/index.ts`
changed. Never let leaderboard concerns leak into `game/` — the engine
does not know a leaderboard exists.

**`src/game/modes.ts`, `src/game/evolution.ts`, `src/game/scoring.ts` and
`src/leaderboard/types.ts` are shared with the server.** All four are
DOM-free and must stay that way: the server imports them so the ranking
order, the nickname rules, the timing curve, the organism ladder and the
points ceiling cannot drift between the two ends. Touching one means
checking both sides.

**The ranking rule is written three times** — `sortEntries()` in
`leaderboard/types.ts`, and both `RANK_ORDER` and `countBetter` in
`server/db.ts`. They must agree exactly. There is a scratchpad test that
compares them; run it after any change to the order.

## Invariants — do not break these

1. **Input is locked during playback.** Keypresses while the sequence is
   flashing are swallowed, not buffered. Show a visible locked state.
2. **Repeated symbols must be visually distinct.** If the sequence is
   `up, up`, the second flash needs a gap or re-trigger animation, or the
   player sees one long flash and loses the round unfairly.
3. **`preventDefault` on arrow keys** — otherwise the page scrolls.
4. **`preventDefault` on `contextmenu`** — otherwise right-click in mouse
   mode opens the browser menu mid-round.
5. **No countdown between rounds.** After a correct answer, the next
   sequence starts within ~600ms. Waiting kills the feel. The evolution
   cue has to fit inside that window rather than extending it.
6. **Every state is reachable by keyboard alone, by mouse alone, and by
   touch alone.** Including menu navigation and retry.
7. **Audio is generated, never sampled.** No asset pipeline exists and
   none should. The reverb impulse is synthesised at startup; symbol
   pitches never transpose, because they are the memory anchor — the
   ambient bed is the thing that has to agree with them.
8. **Nothing competes with the playback timers.** The helix and every cue
   animate `transform`/`opacity` only, on the compositor. No
   `requestAnimationFrame`, no animating layout properties — a dropped
   frame during playback is a round the player loses unfairly.
9. **An unbonded helix rung never shows a symbol colour.** The strand sits
   directly above the pads; colouring an unsolved rung would put the
   answer on screen. Colour arrives only on bonding.
10. **A touch is not a mouse.** Clicks mode reads the mouse *button*, but a
   touchscreen has no right button — a tap reads which *pad* it hit. That
   rule lives in `resolvePointer()` in `ui/board.ts`; change it there and
   nowhere else.

## Conventions

- TypeScript strict mode on. No `any`.
- Named exports, no default exports.
- Timing values live in one place (`game/modes.ts`), never inline.
- CSS custom properties for all colors — no hardcoded hex in components.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.

## SQL house style

In use now — see `server/db.ts`.
- Keywords lowercase: `select`, `from`, `with`, `as`, `cast`
- Identifiers camelCase: `leaderboardEntry`, `achievedAt`
- Always parameterised. Never build a statement by concatenation.

## Scope discipline

`docs/SPEC.md` defines v0.1, `docs/SPEC-v0.2.md` the global leaderboard
and mobile play, `docs/SPEC-v0.3.md` rounds/levels/points and the DNA
helix. Anything marked "later" stays out. If a change feels like it needs
a new dependency or a build step, stop and ask first.
