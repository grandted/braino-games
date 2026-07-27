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
  close(): void
}

interface Row {
  id: number
  nickname: string
  mode: string
  level: number
  avgReactionMs: number
  fastestInputMs: number
  totalInputs: number
  runDurationMs: number
  achievedAt: string
}

export function openStore(path: string): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)

  db.exec(`
    pragma journal_mode = wal;
    pragma foreign_keys = on;

    create table if not exists leaderboardEntry (
      id             integer primary key autoincrement,
      nickname       text    not null,
      mode           text    not null,
      level          integer not null,
      avgReactionMs  integer not null,
      fastestInputMs integer not null,
      totalInputs    integer not null,
      runDurationMs  integer not null,
      achievedAt     text    not null
    );

    create index if not exists leaderboardEntryRank
      on leaderboardEntry (mode, level desc, avgReactionMs asc, achievedAt asc);

    create index if not exists leaderboardEntryAchievedAt
      on leaderboardEntry (mode, achievedAt);
  `)

  // Ranking order is the shared rule: level down, then reaction time up, then
  // whoever got there first.
  const selectWindowed = db.prepare(`
    select id, nickname, mode, level, avgReactionMs, fastestInputMs,
           totalInputs, runDurationMs, achievedAt
      from leaderboardEntry
     where mode = ?
       and achievedAt >= ?
     order by level desc, avgReactionMs asc, achievedAt asc
     limit ?
  `)

  const selectAllTime = db.prepare(`
    select id, nickname, mode, level, avgReactionMs, fastestInputMs,
           totalInputs, runDurationMs, achievedAt
      from leaderboardEntry
     where mode = ?
     order by level desc, avgReactionMs asc, achievedAt asc
     limit ?
  `)

  const insertEntry = db.prepare(`
    insert into leaderboardEntry
      (nickname, mode, level, avgReactionMs, fastestInputMs, totalInputs,
       runDurationMs, achievedAt)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const countBetter = db.prepare(`
    select count(*) as better
      from leaderboardEntry
     where mode = ?
       and (level > ?
            or (level = ? and avgReactionMs < ?)
            or (level = ? and avgReactionMs = ? and achievedAt < ?))
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
        draft.level,
        draft.avgReactionMs,
        draft.fastestInputMs,
        draft.totalInputs,
        draft.runDurationMs,
        achievedAt,
      )
      return { ...draft, id: String(result.lastInsertRowid), achievedAt }
    },

    rankOf(entry) {
      const row = countBetter.get(
        entry.mode,
        entry.level,
        entry.level,
        entry.avgReactionMs,
        entry.level,
        entry.avgReactionMs,
        entry.achievedAt,
      ) as unknown as { better: number } | undefined
      return (row?.better ?? 0) + 1
    },

    close() {
      db.close()
    },
  }
}

function toEntry(row: Row): Entry {
  return {
    id: String(row.id),
    nickname: row.nickname,
    mode: row.mode as ModeId,
    level: row.level,
    avgReactionMs: row.avgReactionMs,
    fastestInputMs: row.fastestInputMs,
    totalInputs: row.totalInputs,
    runDurationMs: row.runDurationMs,
    achievedAt: row.achievedAt,
  }
}
