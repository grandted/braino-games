/**
 * Tangent's leaderboard server.
 *
 * Two jobs: serve `/api/leaderboard`, and serve the built client from `dist/`
 * so production is a single origin with no CORS. In development Vite proxies
 * `/api` here instead (see vite.config.ts) and the static half goes unused.
 *
 * Built on node:http and node:sqlite — no runtime dependencies, same as the
 * game.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import {
  DEFAULT_WINDOW,
  TOP_N,
  isTimeWindow,
  type TimeWindow,
} from '../src/shared/leaderboard/types.ts'
import { openStore } from './db.ts'
import { createRateLimit } from './rateLimit.ts'
import { isKnownGame, validateDraft } from './validate.ts'

const PORT = Number(process.env.TANGENT_PORT ?? 8787)

/**
 * Defaults are resolved against the project root, not the working directory.
 * Resolving against the cwd meant that launching the server from anywhere
 * else quietly created a second, empty database and served an empty board —
 * which looks exactly like losing every score.
 */
const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const DB_PATH = process.env.TANGENT_DB ?? join(PROJECT_ROOT, 'data/tangent.db')
const STATIC_ROOT = process.env.TANGENT_STATIC
  ? resolve(process.env.TANGENT_STATIC)
  : join(PROJECT_ROOT, 'dist')
/** A submitted run is a few hundred bytes; anything larger is not a run. */
const MAX_BODY_BYTES = 4096

const store = openStore(DB_PATH)
const submitLimit = createRateLimit(20, 10 * 60_000)
const readLimit = createRateLimit(240, 60_000)

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error('unhandled request error', error)
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
    else res.end()
  })
})

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (url.pathname === '/api/leaderboard') {
    if (req.method === 'GET') return getLeaderboard(req, res, url)
    if (req.method === 'POST') return postLeaderboard(req, res)
    res.setHeader('allow', 'GET, POST')
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'no such endpoint' })
    return
  }

  await serveStatic(url.pathname, res)
}

function getLeaderboard(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): void {
  if (!readLimit.check(clientKey(req))) {
    sendJson(res, 429, { error: 'slow down' })
    return
  }

  const game = url.searchParams.get('game')
  if (!isKnownGame(game)) {
    sendJson(res, 400, { error: 'unknown game' })
    return
  }

  const mode = url.searchParams.get('mode')
  if (!mode) {
    sendJson(res, 400, { error: 'missing mode' })
    return
  }

  const requested = url.searchParams.get('window') ?? DEFAULT_WINDOW
  const window: TimeWindow = isTimeWindow(requested) ? requested : DEFAULT_WINDOW

  const entries = store.top(game, mode, window, TOP_N)
  // The board changes as people play; a stale cache would be worse than none.
  res.setHeader('cache-control', 'no-store')
  sendJson(res, 200, { game, mode, window, entries })
}

async function postLeaderboard(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!submitLimit.check(clientKey(req))) {
    sendJson(res, 429, { error: 'too many submissions, try again later' })
    return
  }

  // Answer politely when the client announced the size; the streaming guard
  // below is the backstop for one that didn't, or lied.
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > MAX_BODY_BYTES) {
    sendJson(res, 413, { error: 'body too large' })
    return
  }

  let body: string
  try {
    body = await readBody(req)
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 413, {
        error: error instanceof Error ? error.message : 'body too large',
      })
    }
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    sendJson(res, 400, { error: 'body must be valid JSON' })
    return
  }

  const validation = await validateDraft(parsed)
  if (!validation.ok) {
    sendJson(res, 422, { error: validation.reason })
    return
  }

  // The clock is ours, not the client's.
  const entry = store.insert(validation.draft, new Date().toISOString())
  sendJson(res, 201, { entry, rank: store.rankOf(entry) })
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const requested = pathname === '/' ? '/index.html' : pathname
  // normalize + prefix check keeps '../' out of the served root.
  const target = join(STATIC_ROOT, normalize(requested))
  if (!target.startsWith(STATIC_ROOT)) {
    sendJson(res, 403, { error: 'forbidden' })
    return
  }

  try {
    const file = await readFile(target)
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
    })
    res.end(file)
  } catch {
    // Single-page app: unknown paths fall back to the shell, if it's built.
    try {
      const shell = await readFile(join(STATIC_ROOT, 'index.html'))
      res.writeHead(200, { 'content-type': CONTENT_TYPES['.html'] })
      res.end(shell)
    } catch {
      sendJson(res, 404, {
        error: 'not found — run `npm run build` to produce dist/',
      })
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        // Stop reading, but leave the socket alive so a 413 can still be sent.
        req.pause()
        rejectPromise(new Error('body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', rejectPromise)
  })
}

/**
 * Rate-limit key. Behind a proxy the socket address is the proxy's, so the
 * first x-forwarded-for hop is used when present — set TANGENT_TRUST_PROXY
 * only when something in front is actually rewriting it, since a client can
 * otherwise spoof the header freely.
 */
function clientKey(req: IncomingMessage): string {
  if (process.env.TANGENT_TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for']
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
    const hop = first?.split(',')[0]?.trim()
    if (hop) return hop
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

server.listen(PORT, () => {
  console.log(`tangent leaderboard on http://localhost:${PORT}`)
  console.log(`  database: ${DB_PATH}`)
  console.log(`  static:   ${STATIC_ROOT}`)
  // Printed so "are my scores still there?" is answerable at a glance.
  const kept = store.count()
  console.log(`  entries:  ${kept}${kept === 0 ? ' (empty board)' : ''}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    store.close()
    process.exit(0)
  })
}
