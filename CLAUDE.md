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
- No runtime dependencies. Keep it that way unless there's a strong reason.

Why no React: this is a timing-sensitive game loop driven by discrete
input events. Direct DOM writes are simpler here than reconciliation, and
the whole UI is about six elements.

## Commands

```bash
npm run dev        # vite dev server, port 5173
npm run build      # production build to dist/
npm run preview    # serve the build locally
npm run typecheck  # tsc --noEmit
```

Dev server runs inside WSL2; reach it from Windows at
`http://localhost:5173`. If localhost forwarding misbehaves, use
`npm run dev -- --host` and hit the WSL IP.

## Architecture

```
src/
├── main.ts              entry, wires screens together
├── game/
│   ├── engine.ts        state machine: idle→playback→input→result
│   ├── sequence.ts      generation + validation
│   └── modes.ts         mode definitions (symbols, keybinds, colors)
├── ui/
│   ├── screens.ts       menu / game / gameover / leaderboard
│   ├── board.ts         renders the pad, handles flash animation
│   └── audio.ts         per-symbol tones
├── leaderboard/
│   ├── types.ts         Provider interface + Entry type
│   ├── local.ts         localStorage implementation (v0.1)
│   └── index.ts         provider selection
└── styles/
```

**The leaderboard is behind an interface on purpose.** v0.1 ships a
localStorage provider. v0.2 adds a remote one. Never let leaderboard
concerns leak into `game/` — the engine should not know a leaderboard
exists.

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
6. **Every state is reachable by keyboard alone and by mouse alone.**
   Including menu navigation and retry.

## Conventions

- TypeScript strict mode on. No `any`.
- Named exports, no default exports.
- Timing values live in one place (`game/modes.ts`), never inline.
- CSS custom properties for all colors — no hardcoded hex in components.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.

## If SQL enters the project (v0.2 leaderboard)

Follow the owner's house style:
- Keywords lowercase: `select`, `from`, `with`, `as`, `cast`
- Identifiers camelCase: `leaderboardEntry`, `playerNickname`, `achievedAt`

## Scope discipline

`docs/SPEC.md` defines v0.1. Anything marked "later" stays out. If a
change feels like it needs a new dependency, a build step, or a backend,
stop and ask first.
