# Tiny Brain Games

**[tinybrain.games](https://tinybrain.games)** — a platform for small
mind games in the browser. The landing page is a deck
of cards — one card per game. Pick one, play it, and the back control
returns you to the deck.

Built with no runtime dependencies at either end.

## Games

**[Tangent](#tangent)** — a pattern grows one step at a time. Keep it in
your hands, not your head. *Ready.*

Two more slots sit face down on the deck, waiting.

## Play

```bash
npm install
npm run dev         # the platform, port 5173
npm run dev:server  # the leaderboard, port 8787
```

Open <http://localhost:5173> and pick a mode. Both processes are wanted
in development — the game proxies `/api` to the leaderboard server.

To run it the way it ships, as one process on one port:

```bash
npm start           # builds, then serves the game and the API on 8787
```

To play on a phone over your local network, run `npm run dev -- --host`
and open the printed address.

## Deploy

```bash
docker compose up -d --build
```

That is the whole thing: one container on port 8787, serving the game and
the API. It builds the client inside the image, so the host needs nothing
but Docker — no Node, no `npm install`.

The board is bind-mounted from `./data`, which is where it already lives,
so an existing database is picked up as-is and a rebuild leaves it alone.
Back that directory up; nothing else in the container is worth keeping.

Behind a reverse proxy, set `TANGENT_TRUST_PROXY: "1"` in
`docker-compose.yml` — but only if the proxy actually rewrites
`x-forwarded-for`, because otherwise a client can spoof the header and
walk past the rate limit.

---

## Tangent

Watch the pattern, play it back, and watch it grow by one every round.
Every input you get right bonds a base pair of DNA — fill a genome and you
evolve.

*tangent* — Swedish for a key on a keyboard.

### Modes

**Arrows** — four directions, in the standard cluster. Twice the
information per step, so patterns turn brutal fast.

**Clicks** — left and right mouse button. Longer runs, and a different
kind of hard.

**Grid** — a 3×3 of nine cells on `QWE/ASD/ZXC`. The hardest pattern
space in the game, and the one where the sound does the most work: a
cell's column sets its note and which ear it comes from, its row sets the
octave. Higher on screen is literally higher.

**Pi** — recite π. Round 1 is `3`, round 2 is `3 1`, round 3 is `3 1 4`,
and on into `3.14159265…`. Unlike every other mode the sequence never
changes, so what you learn carries from one run to the next — and if you
already know π, you can go a very long way. The digits sound a pentatonic
scale, so the opening plays as a melody.

On a phone all four become virtual controls: four thumb pads for Arrows,
two large ones for Clicks, nine for Grid, a keypad for Pi.

## How it works

Round 1 shows one input. Reproduce it and round 2 shows the same input
plus a new one. The sequence is append-only, which is what makes it
trainable — you're not memorising a fresh string each round, you're
building a motor pattern and extending it.

Every correct input bonds one base pair of DNA. Fill a genome and you
evolve — virus, bacterium, amoeba, sponge, jellyfish, fish, and on up.
That's your **level**, and each one costs more rounds than the last: the
second arrives at round 3, the third at round 7, the fourth at 14, the
fifth at 25. Most runs end around the amoeba.

Clear a round that's a multiple of 100 and you gain a life. Nobody has.

The pattern plays faster every round, but there's no clock on your
inputs — take as long as you like.

You get three lives. A wrong input spends one and replays the same round,
same pattern, another go at it. The third miss ends the run.

**Points** are what the board ranks on, and they reward speed: each round
pays for its depth multiplied by how fast you answered it, plus a bonus
every time you evolve. A quick player can top the board having survived
fewer rounds than the player below them.

After points come level, then rounds, then reaction time. The board is
per mode and never merged — a clicks run is not an arrows run.

## Leaderboard

Global, and per mode. Sliceable by last 24 hours, last week, last month
or all time, so the board isn't just a wall of records nobody can reach.

Scores live on the server, in `data/tangent.db`, and persist across
restarts, rebuilds and branch switches. That file is gitignored, so it is
the one thing in the project a commit will not bring back — copy it if you
care about it.

There is no local board, so no network means no leaderboard. Submissions get light sanity checks (a run whose numbers
contradict each other is refused), but this is not anti-cheat and isn't
trying to be.

## Status

**v1.0** — the platform, with Tangent on it: four modes, evolution
levels, points, the 3D helix, a global board, phone play, and a one
command deploy.

Roadmap:
- v1.1 — more modes still (WASD, mixed keyboard/mouse)
- later — the two face-down cards

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — game rules, timing, scope
- [`docs/SPEC-v0.2.md`](docs/SPEC-v0.2.md) — global leaderboard, mobile
- [`docs/SPEC-v0.3.md`](docs/SPEC-v0.3.md) — rounds, levels, points, DNA
- [`CLAUDE.md`](CLAUDE.md) — context for Claude Code

## Stack

Vite and TypeScript on the client, `node:http` and `node:sqlite` on the
server. No framework, no runtime dependencies at either end.

## License

[GNU AGPL-3.0-or-later](LICENSE). Use it, change it, run it — but if you
host a modified version where other people can play it, publish your
source too.
