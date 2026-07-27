# Tangent

A muscle-memory game for your browser. Watch a sequence, repeat it, watch
it grow.

*tangent* — Swedish for a key on a keyboard.

## Play

```bash
npm install
npm run dev
```

Open <http://localhost:5173>, hit play, pick a mode.

## Modes

**Arrows** — four keys, the standard cluster. Two bits of information per
step, so sequences get hard fast.

**Clicks** — left and right mouse button. Lower entropy, longer runs,
different kind of hard.

## How it works

Level 1 shows one input. Reproduce it and level 2 shows the same input
plus a new one. The sequence is append-only, which is what makes it
trainable — you're not memorising a fresh string each round, you're
building a motor pattern and extending it.

Speed increases with level. There's no time limit on your inputs.

You get three lives. A wrong input spends one and replays the same level
— same sequence, another go at it. The third miss ends the run.

Scores are ranked by level reached, then by average reaction time. The
board is per mode and never merged — a level-10 clicks run is not a
level-10 arrows run.

## Status

**v0.1** — playable, local leaderboard only.

Roadmap:
- v0.2 — global leaderboard
- v0.3 — additional modes (WASD, numpad, mixed)

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — game rules, timing, scope
- [`CLAUDE.md`](CLAUDE.md) — context for Claude Code

## Stack

Vite, TypeScript, no framework, no runtime dependencies.
