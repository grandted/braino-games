# Tangent

A muscle-memory game for your browser. Watch a sequence, repeat it, watch
it grow.

*tangent* — Swedish for a key on a keyboard.

## Play

```bash
npm install
npm run dev         # the game, port 5173
npm run dev:server  # the leaderboard, port 8787
```

Open <http://localhost:5173> and pick a mode. Both processes are wanted
in development — the game proxies `/api` to the leaderboard server.

To run it the way it ships, as one process on one port:

```bash
npm start           # builds, then serves the game and the API on 8787
```

Works on a phone: the pads become virtual arrow keys or virtual mouse
buttons depending on the mode you pick. To play on one over your local
network, run `npm run dev -- --host` and use the printed address.

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

## Leaderboard

Global, and per mode. Sliceable by last 24 hours, last week, last month
or all time, so the board isn't just a wall of records nobody can reach.

Scores live on the server — there is no local board, so no network means
no leaderboard. Submissions get light sanity checks (a run whose numbers
contradict each other is refused), but this is not anti-cheat and isn't
trying to be.

## Status

**v0.2** — global leaderboard, mobile play.

Roadmap:
- v0.3 — additional modes (WASD, numpad, mixed)

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — game rules, timing, scope
- [`docs/SPEC-v0.2.md`](docs/SPEC-v0.2.md) — global leaderboard, mobile
- [`CLAUDE.md`](CLAUDE.md) — context for Claude Code

## Stack

Vite and TypeScript on the client, `node:http` and `node:sqlite` on the
server. No framework, no runtime dependencies at either end.
