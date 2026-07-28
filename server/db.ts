/**
 * SQLite storage for the global board.
 *
 * `node:sqlite` ships with Node, so the server keeps the project's no-runtime-
 * dependency rule. Statements are prepared once and always parameterised.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ModeId } from '../src/game/modes.ts'
import {
  TOP_N,
  windowCutoff,
  type Entry,
  type EntryDraft,
  type TimeWindow,
} from '../src/leaderboard/types.ts'

export interface Store {
  top(mode: ModeId, window: TimeWindow, limit?: number): Entry[]
  insert(draft: EntryDraft, achievedAt: string): Entry
  /** All-time position of an entry within its mode, 1-based. */
  rankOf(entry: Entry): number
  /** Total rows kept, across every mode. Logged at startup. */
  count(): number
  close(): void
}

/** Bumped when the schema changes. Recorded in the database itself. */
const SCHEMA_VERSION = 3

interface Row {
  id: number
  nickname: string
  mode: string
  points: number
  level: number
  rounds: number
  avgReactionMs: number
  fastestInputMs: number
  totalInputs: number
  runDurationMs: number
  achievedAt: string
}

/** Columns every read returns, in one place so the two selects cannot drift. */
const COLUMNS = `
  id, nickname, mode, points, level, rounds, avgReactionMs, fastestInputMs,
  totalInputs, runDurationMs, achievedAt
`

/**
 * Must stay identical to `sortEntries` in src/leaderboard/types.ts, and to the
 * comparison ladder in `countBetter` below.
 */
const RANK_ORDER = `
  points desc, level desc, rounds desc, avgReactionMs asc, achievedAt asc
`

export function openStore(path: string): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)

  db.exec(`
    pragma journal_mode = wal;
    pragma foreign_keys = on;

    create table if not exists leaderboardEntryV2 (
      id             integer primary key autoincrement,
      nickname       text    not null,
      mode           text    not null,
      points         integer not null,
      level          integer not null,
      rounds         integer not null,
      avgReactionMs  integer not null,
      fastestInputMs integer not null,
      totalInputs    integer not null,
      runDurationMs  integer not null,
      achievedAt     text    not null
    );

    create index if not exists leaderboardEntryV2Rank
      on leaderboardEntryV2 (mode, points desc, level desc, rounds desc,
                             avgReactionMs asc, achievedAt asc);

    create index if not exists leaderboardEntryV2AchievedAt
      on leaderboardEntryV2 (mode, achievedAt);

    create table if not exists schemaMeta (
      key   text primary key,
      value text not null
    );
  `)

  migrate(db)

  const selectWindowed = db.prepare(`
    select ${COLUMNS}
      from leaderboardEntryV2
     where mode = ?
       and achievedAt >= ?
     order by ${RANK_ORDER}
     limit ?
  `)

  const selectAllTime = db.prepare(`
    select ${COLUMNS}
      from leaderboardEntryV2
     where mode = ?
     order by ${RANK_ORDER}
     limit ?
  `)

  const insertEntry = db.prepare(`
    insert into leaderboardEntryV2
      (nickname, mode, points, level, rounds, avgReactionMs, fastestInputMs,
       totalInputs, runDurationMs, achievedAt)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // The same five keys as RANK_ORDER, unrolled into a strict "is better than"
  // comparison. Each line ties every key above it and wins on its own.
  const countAll = db.prepare(
    'select count(*) as total from leaderboardEntryV2',
  )

  const countBetter = db.prepare(`
    select count(*) as better
      from leaderboardEntryV2
     where mode = ?
       and (points > ?
            or (points = ? and level > ?)
            or (points = ? and level = ? and rounds > ?)
            or (points = ? and level = ? and rounds = ? and avgReactionMs < ?)
            or (points = ? and level = ? and rounds = ? and avgReactionMs = ?
                and achievedAt < ?))
  `)

  return {
    top(mode, window, limit = TOP_N) {
      const cutoff = windowCutoff(window)
      const rows =
        cutoff === null
          ? selectAllTime.all(mode, limit)
          : selectWindowed.all(mode, cutoff, limit)
      return (rows as unknown as Row[]).map(toEntry)
    },

    insert(draft, achievedAt) {
      const result = insertEntry.run(
        draft.nickname,
        draft.mode,
        draft.points,
        draft.level,
        draft.rounds,
        draft.avgReactionMs,
        draft.fastestInputMs,
        draft.totalInputs,
        draft.runDurationMs,
        achievedAt,
      )
      return { ...draft, id: String(result.lastInsertRowid), achievedAt }
    },

    count() {
      const row = countAll.get() as unknown as { total: number } | undefined
      return row?.total ?? 0
    },

    rankOf(entry) {
      const { points, level, rounds, avgReactionMs, achievedAt } = entry
      const row = countBetter.get(
        entry.mode,
        points,
        points,
        level,
        points,
        level,
        rounds,
        points,
        level,
        rounds,
        avgReactionMs,
        points,
        level,
        rounds,
        avgReactionMs,
        achievedAt,
      ) as unknown as { better: number } | undefined
      return (row?.better ?? 0) + 1
    },

    close() {
      db.close()
    },
  }
}

/**
 * Schema migrations, run once and recorded.
 *
 * The v0.3 cleanup used to be an unconditional `drop table` in the startup
 * path — it had done its job long ago but ran on every single boot, which is
 * a destructive statement sitting permanently in the hot path for no reason.
 * It now runs only if this database has never been stamped, and the stamp
 * means it can never run again.
 */
function migrate(db: DatabaseSync): void {
  const row = db
    .prepare(`select value from schemaMeta where key = 'version'`)
    .get() as unknown as { value: string } | undefined
  const version = row ? Number(row.value) : 0

  if (version < 3) {
    // Pre-v0.3 rows had no points and no rounds. Scoring them after the fact
    // would be inventing numbers nobody earned, so the old table goes — once.
    db.exec('drop table if exists leaderboardEntry')
  }

  if (version !== SCHEMA_VERSION) {
    db.prepare(
      `insert into schemaMeta (key, value) values ('version', ?)
         on conflict(key) do update set value = excluded.value`,
    ).run(String(SCHEMA_VERSION))
  }
}

function toEntry(row: Row): Entry {
  return {
    id: String(row.id),
    nickname: row.nickname,
    mode: row.mode as ModeId,
    points: row.points,
    level: row.level,
    rounds: row.rounds,
    avgReactionMs: row.avgReactionMs,
    fastestInputMs: row.fastestInputMs,
    totalInputs: row.totalInputs,
    runDurationMs: row.runDurationMs,
    achievedAt: row.achievedAt,
  }
}
