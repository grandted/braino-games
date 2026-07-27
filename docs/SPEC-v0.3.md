# Tangent — v0.3 Specification

Rounds, levels, points, and the DNA helix.

v0.1 (`SPEC.md`) describes the core game; v0.2 (`SPEC-v0.2.md`) the global
leaderboard and mobile play. This adds the milestone layer the game lacked:
progress you can see, and a score that rewards speed rather than only
endurance.

---

## The rename

Everything v0.1 and v0.2 called a **level** is now a **round**. `level` has
been reused for the evolutionary tier. This is the single most likely source
of future confusion in this codebase, so it is stated first.

| Term | Meaning |
|---|---|
| **round** | one sequence reproduction; round N has N symbols |
| **level** | evolutionary tier — the organism being solved |
| **base pair** | one correct input; bonds one rung of the genome |
| **genome** | base pairs needed to complete the current level |
| **points** | score; the leaderboard's primary measure |

---

## Levels — the evolution ladder

A **level** is an organism. You reach the next one by clearing rounds, and
each level costs more rounds than the last: +2, +4, +7, +11, +16, +22 … Those
gaps close to `roundsCleared = k - 1 + (k-1)k(k+1)/6`, the tetrahedral
numbers.

| Level | Organism | First played at round | Genome |
|---|---|---|---|
| 1 | virus | 1 | 3 bp |
| 2 | bacterium | 3 | 18 bp |
| 3 | amoeba | 7 | 70 bp |
| 4 | sponge | 14 | 209 bp |
| 5 | jellyfish | 25 | 520 bp |
| 6 | fish | 41 | 1,133 bp |
| 7 | amphibian | 63 | 2,233 bp |
| 8 | reptile | 92 | 4,070 bp |
| 9 | mammal | 129 | 6,969 bp |
| 10 | human | 175 | 11,340 bp |

Calibrated against what people actually do, not against what sounds good.
Most runs end between rounds 8 and 20, so:

- a typical good run reaches **level 3**, the amoeba
- a strong player reaches **level 4**
- round 31, the ceiling documented for Simon, is **level 5**
- round 100 is **level 8**, and is not expected to be reachable by anyone

That last point is deliberate. The sequence stays append-only and unbounded,
so round 100 means holding a 100-symbol pattern and making 5,050 correct
inputs in one run — measured at a steady 300ms per input, just under an hour
without a fourth mistake.

Levels are meant to be rare. Under this ladder most players will see three
organisms in a good run, and everything from the fish upward is for people
who have genuinely drilled the game.

### Genomes

A level's genome is every base pair earned during the rounds that level
spans, so the strand fills across several rounds and completes exactly as the
level's final round is cleared. Level 3 spans rounds 7-13 and takes 70 base
pairs; level 4 spans rounds 14-24 and takes 209.

**A miss unbonds the base pairs earned in the round being replayed**, matching
the round replay v0.1 already does. Re-clearing re-earns them, so nothing is
permanently lost and a miss cannot farm genome progress.

**Level is a function of rounds cleared** and never changes mid-round. The
server derives it rather than trusting the client, and rejects any submission
whose level disagrees with its rounds.

---

## Free lives

Clearing a round that is a multiple of 100 grants a life, with no ceiling: 3
lives become 4 at round 100, 5 at round 200, and so on.

At round 100 a run has already survived 5,050 correct inputs on three lives.
This is a reward for the mythical, not a top-up — it is entirely possible that
no player ever triggers it, and that is the intent.

---

## The kill screen

Past human — level 11, round 231 — the ladder stops naming animals. Organism
names become `???`, `anomaly`, `observer`, `the pattern`, then `strain N`. The
palette inverts and drifts, the points counter flickers, and hue stops
following the ladder.

Reaching it is not expected to be possible. It exists for the same reason NES
Tetris has a level 29: so there is somewhere the game was not built to go, and
a rumour about what happens there.

**Deliberately absent from the README.** It is documented here because the
owner needs to maintain it, not because players should read it.

---

## Points

Awarded per round cleared, from that round's own average reaction time:

```
base   = 100 * round
speed  = clamp(600 / avgReactionMsThisRound, 0.5, 3.0)
award  = round(base * speed)

evolution bonus = 1000 * tier, when a genome completes
```

Speed is scored **per round**, so one sharp round still pays inside an
otherwise cautious run. The round multiplier keeps deep runs dominant unless
someone is dramatically faster. The 3.0 cap stops one freak round from
dwarfing an entire run.

No cross-mode adjustment. Clicks mode scores higher for the same reason it
reaches further, and the boards never meet.

---

## Leaderboard

Ranking order, in full:

1. **points**, descending
2. level, descending
3. rounds, descending
4. average reaction, ascending
5. `achievedAt`, ascending — an equal run that got there first keeps the rank

Points first is the point: **a quick player can top the board with fewer
rounds than the player below them.** That is the intended behaviour, not a
side effect.

The rule is written three times — `sortEntries()` in `leaderboard/types.ts`,
and `RANK_ORDER` and `countBetter` in `server/db.ts`. They must agree, and
there is a test that checks they do.

### Schema

`leaderboardEntry` was dropped and replaced by `leaderboardEntryV2`, gaining
`points` and `rounds` and reusing `level` for the tier. Pre-v0.3 rows had no
points, and scoring them retroactively would have meant inventing numbers
nobody earned, so the old table goes on first start.

### Validation

On top of v0.2's checks:

- `rounds` between 1 and 500, with `totalInputs >= rounds * (rounds + 1) / 2`
- `level` must equal the tier the server derives from those rounds
- `points` must not exceed `maxPoints(rounds)` — every round at the maximum
  speed multiplier plus every evolution bonus on the way

The ceiling comes from the same `scoring.ts` the game uses, so it cannot drift
from what the engine can actually award.

---

## The DNA helix

The strand sits between the level info and the pads, centred on desktop and
phone, and shows how much of the current organism's genome is solved.

Each rung is a base-pair bond with a node at either end, spinning about the
horizontal axis. Neighbouring rungs are offset in phase, so the two node trails
trace a double helix and swap depth as they turn; perspective scales the near
node up and the far one down, which is what makes it read as 3D rather than as
a flat wave.

**Rungs are literal while they can be.** Below the cap (40 on desktop, 24 on
touch, 18 on narrow phones) one rung is one base pair — so a virus genuinely
shows three rungs and a bacterium eighteen. Above the cap each rung is a chunk.
The one rule that matters: **a full strand always means a full genome.** Fill is
floored rather than rounded, and only `bonded >= genome` may light the last
rung, so the strand never promises an evolution that has not happened.

**The strand carries the locked state.** It hangs still and dim during
playback, and spins up and brightens when it is the player's turn. That is
invariant 1 made visible, rather than decoration competing with the pads for
attention during playback.

Colour comes from the organism's hue, which also tints the screen backdrop and
shifts on evolution the way Tetris changes colour every tenth line. Completing
a genome runs a wave of light along the strand.

**Anti-spoiler rule**: only a rung that is already bonded ever takes a symbol
colour — the newest bond flashes in the colour of the input that made it. An
unbonded rung showing its symbol would be a cheat sheet directly above the
pads.

Everything animated is `transform` or `opacity`, one CSS animation per rung, no
`requestAnimationFrame`. Under `prefers-reduced-motion` the strand freezes at
its helical shape and stops turning; the information it carries is colour, so
nothing is lost.

---

## Definition of done for v0.3

- [x] round/level rename across client, server, API and schema
- [x] evolution ladder spaced +2, +4, +7, +11 …, with a tail that cannot be
      fallen off
- [x] genome fills exactly across a level and never overfills mid-round
- [x] free life every 100 rounds, no ceiling
- [x] kill screen past the named organisms
- [x] points per round, with the evolution bonus
- [x] leaderboard ranks on points first; a fast shallow run can outrank a slow
      deep one
- [x] server derives level and bounds points; both rejected when inconsistent
- [x] old table dropped and replaced on first start
- [x] `npm run build` and `npm run typecheck` clean (client + server)
- [ ] Phase 1 playtested — does the slower ladder feel right?
- [x] 3D DNA helix, per-organism palette, evolution sweep
- [ ] Helix seen on a real screen (desktop and phone)
