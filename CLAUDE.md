# CLAUDE.md

Context for Claude Code. Read this before making changes.

## What this is

**Tangent** — a browser-based muscle-memory game. A sequence of inputs is
shown, the player repeats it, the sequence grows by one each level. Two
modes: arrow keys (4 symbols) and mouse buttons (2 symbols).

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
│   └── modes.ts         mode definitions (symbols, keybinds, colors),
│                        plus TIMING and RULES — every tunable
├── ui/
│   ├── screens.ts       menu / game / gameover / leaderboard
│   ├── board.ts         renders the pad, flash animation, all input
│   └── audio.ts         per-symbol tones
├── leaderboard/
│   ├── types.ts         Provider interface, Entry, windows, shared rules
│   ├── remote.ts        HTTP provider against /api (v0.2)
│   ├── labels.ts        derived entry labels + time formatting
│   ├── nickname.ts      remembers the last nickname locally
│   └── index.ts         provider selection
└── styles/

server/
├── index.ts             node:http — /api + serves dist/
├── db.ts                node:sqlite storage
├── validate.ts          plausibility checks on submitted runs
└── rateLimit.ts         in-memory fixed-window limiter
```

**The leaderboard is behind an interface on purpose.** v0.2 swapped the
localStorage provider for a remote one and only `leaderboard/index.ts`
changed. Never let leaderboard concerns leak into `game/` — the engine
does not know a leaderboard exists.

**`src/leaderboard/types.ts` and `src/game/modes.ts` are shared with the
server.** Both are DOM-free and must stay that way: the server imports
them so the ranking order, the nickname rules and the timing curve
cannot drift between the two ends. Touching either means touching both.

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
   sequence starts within ~600ms. Waiting kills the feel.
6. **Every state is reachable by keyboard alone, by mouse alone, and by
   touch alone.** Including menu navigation and retry.
7. **A touch is not a mouse.** Clicks mode reads the mouse *button*, but a
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
and mobile play. Anything marked "later" stays out. If a change feels
like it needs a new dependency or a build step, stop and ask first.
