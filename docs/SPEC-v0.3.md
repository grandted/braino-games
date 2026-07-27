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

Every correct input bonds one base pair. Fill the genome and the run evolves:
new organism, new palette, new background, a longer strand to fill.

Genome sizes are chosen so a genome completes exactly as a round is cleared.
Clearing round N banks N(N+1)/2 base pairs, so the boundaries land on the odd
rounds:

| Tier | Organism | Genome | Completes after round |
|---|---|---|---|
| 1 | virus | 1 | 1 |
| 2 | bacterium | 5 | 3 |
| 3 | amoeba | 9 | 5 |
| 4 | sponge | 13 | 7 |
| 5 | jellyfish | 17 | 9 |
| 6 | fish | 21 | 11 |
| 7 | amphibian | 25 | 13 |
| 8 | reptile | 29 | 15 |
| 9 | mammal | 51 | 18 |
| 10 | human | 60 | 21 |

The ladder was spaced against what people can actually do. Arrows mode is two
bits a symbol and most runs end somewhere between rounds 8 and 12, so the
early tiers arrive fast and the later ones are genuinely aspirational. Clicks
mode runs longer and pushes further up the ladder — which is fine, because
boards are per mode and never merged.

Past human the ladder continues procedurally (`cyborg`, `starfarer`,
`ascendant`, then `strain N`), genome growing by a fixed step and hue rotating.
Nobody will see it. It exists so a freak run cannot fall off the end.

**A miss unbonds the base pairs earned in the round being replayed**, matching
the round replay v0.1 already does. Re-clearing re-earns them, so nothing is
permanently lost and a miss cannot farm genome progress.

**Level is a function of rounds cleared.** Because genomes complete on round
boundaries, it cannot be otherwise. Level is a milestone and a display band,
not an independent ranking signal — which is why the server derives it rather
than trusting the client, and rejects any submission whose level disagrees
with its rounds.

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

## Phase 2 — the DNA helix

Not built yet. Sketched here so the shape is on record.

The strand represents the current organism's genome, sitting between the level
info and the pads, centred on desktop and phone. Rungs bond as base pairs are
earned; the backbone knits closed behind them. Rendered with CSS 3D transforms
so the helix genuinely rotates, compositor-only, no `requestAnimationFrame` —
the playback loop is timing-sensitive and nothing may compete with it.

Each organism carries a palette and background that change on evolution, the
way Tetris changes at every tenth line.

**Anti-spoiler rule**: an unbonded rung must never show its symbol's colour, or
the strand becomes a cheat sheet sitting directly above the pads. Colour
arrives on bonding, or momentarily during playback when the pad is showing that
symbol anyway.

---

## Definition of done for v0.3

- [x] round/level rename across client, server, API and schema
- [x] evolution ladder, with a procedural tail that cannot be fallen off
- [x] points per round, with the evolution bonus
- [x] leaderboard ranks on points first; a fast shallow run can outrank a slow
      deep one
- [x] server derives level and bounds points; both rejected when inconsistent
- [x] old table dropped and replaced on first start
- [x] `npm run build` and `npm run typecheck` clean (client + server)
- [ ] Phase 1 playtested — is the tier pacing right, is the points curve right?
- [ ] Phase 2: the 3D DNA helix
