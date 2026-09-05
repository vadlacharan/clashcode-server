# ClashCode Backend

Payload CMS 3 backend for a 1v1 competitive coding platform. Two players are
matched through a queue, get the same problem, and the **first accepted
submission wins**. The backend is authoritative for match state, submissions,
judging and winner determination.

## Stack

- **Payload CMS 3** (Next.js runtime) + **PostgreSQL** — users, problems, test cases, matches, submissions
- **Redis** — matchmaking queue, BullMQ jobs, rate limits, disconnect grace timers
- **BullMQ workers** (separate process) — judge pipeline, matchmaker tick, match sweeper (timeouts / disconnect forfeits)
- **Socket.IO** (attached to the same server, Redis adapter) — realtime match updates
- **Piston** (self-hosted, Docker) — sandboxed code execution
- Local judge provider — dev convenience on machines where the Piston image can't run (e.g. Apple Silicon); **never use in production**

## Quick start (local dev)

```sh
# 1. Infrastructure: Postgres, Redis, Piston
docker compose up -d

# 2. Install language runtimes into Piston (one time; persisted in a docker volume)
npm run piston:install-packages

# 3. Seed users + problems (admin, alice, bob + 5 problems with public/hidden tests)
npm run seed

# 4. Backend API + admin + Socket.IO  -> http://localhost:3000
npm run dev

# 5. Workers (judge, matchmaker, sweeper) — separate terminal
npm run workers
```

Frontend lives in the sibling `frontend/` repo (Next.js on :3001).

### Seeded accounts

| username | password | role |
|---|---|---|
| admin | AdminPass123! | admin (Payload admin panel at `/admin`) |
| alice | password123 | user |
| bob | password123 | user |

### Language runtimes

`npm run piston:install-packages` installs `python`, `node` (JavaScript), `gcc`
(C++) and `go`. If a runtime is missing (e.g. C++ was skipped), submissions in
that language fail with a judge error telling you to install it — everything
else keeps working. Re-running the script is idempotent.

## Judge providers

`JUDGE_PROVIDER` env var:

- **`piston`** (default) — executes via the self-hosted Piston API. Use on
  production/amd64 hosts. Piston's isolate sandbox needs native Linux; on
  Apple Silicon the amd64 image cannot execute (isolate's `clone` fails under
  emulation).
- **`local`** — executes code directly on the host with timeouts and output
  caps. Development convenience only, not a sandbox. Requires `python3`,
  `node`, `g++`/`go` on the host.

## How a match works

1. `POST /api/matchmaking/join` — adds the user to a FIFO Redis sorted set.
2. A repeatable BullMQ job (1s) pops the two oldest players atomically (Lua),
   picks a random problem (avoiding each player's last 3 problems) and creates
   the match. Both players receive `match:start` over Socket.IO.
3. **Run** (`POST /api/match/run`) executes against **public tests only**, is
   not stored, and does not affect the match.
4. **Submit** (`POST /api/match/submit`) creates a pending submission and
   enqueues a judge job. The worker executes against **all** tests (public +
   hidden), stores per-test results (hidden tests: pass/fail only — their
   inputs/outputs never leave the server), and on full acceptance atomically
   claims the match:
   `UPDATE matches ... WHERE id = $1 AND status = 'active'` — the first
   accepted submission wins; concurrent racers lose the claim cleanly.
5. Elo is applied on finish. K factor derives from problem difficulty:
   easy=16, medium=32, hard=48, insane=64. Draws (timeout) change no rating;
   forfeits count as a rated loss for the leaver.
6. **Timeouts**: each problem has `timeLimitSeconds`; the sweeper ends the
   match in a draw when it expires.
7. **Disconnects**: closing all sockets starts a 75s grace timer; the sweeper
   awards the win to the opponent if the player does not reconnect.

## API (custom endpoints)

| Method | Path | Description |
|---|---|---|
| POST | `/api/matchmaking/join` | join the queue |
| POST | `/api/matchmaking/leave` | leave the queue |
| GET | `/api/match/active` | the caller's active match id |
| GET | `/api/match/view?matchId=` | sanitized match page payload (statement, public examples, own submissions, opponent stats) |
| POST | `/api/match/run` | `{ matchId, language, code }` — run against public tests |
| POST | `/api/match/submit` | `{ matchId, language, code }` — judged on all tests |
| POST | `/api/match/forfeit` | concede the match |
| GET | `/api/match/history` | caller's match history |
| GET | `/api/leaderboard` | top players by rating |

Auth: `Authorization: JWT <token>` from `POST /api/users/login`
(username + password only).

## Realtime events (Socket.IO)

Rooms: `user:<id>`, `match:<id>`. Auth via the same JWT in the handshake
(`auth: { token }`).

- `match:start` / `match:resume` (user room)
- `match:progress` (match room) — both players' live stats
- `submission:result` (author only) — full per-test results (hidden tests still sanitized)
- `match:finished` — winner, end reason, rating deltas
- `match:disconnected` / `match:reconnected` — opponent connection status + grace countdown

## Data model

- **users** — username+password (`loginWithUsername`), role, rating (default 1200), W/L/D
- **problems** — title, slug, difficulty, `timeLimitSeconds` (per-problem match duration), `cpuTimeSeconds` (per-test limit), lexical statement, constraints, per-language starter templates. Deletion blocked once used in a match
- **test-cases** — input (stdin), expected output, `isPublic`, order. Read access is **admin-only**; user-facing surfaces only ever see public test data or sanitized results
- **matches** — players, problem, status, endReason (solved/timeout/forfeit/aborted), winner, timestamps, per-player live stats, rating snapshot
- **submissions** — match, author, language, code, status, per-test results, created via backend logic only

## Edge cases handled

- matchmaking race — atomic Lua pop + Redis in-match markers + DB re-check
- double-join / queue while in an active match — 409
- concurrent accepted submissions — single atomic conditional update decides the winner
- submission after match end — rejected
- rate limits — min 10s between submissions, 50 per match, run/join/login limits
- Judge unavailable — job retries with backoff, submission marked `judge_error`, match continues
- problem deleted mid-pool — delete blocked once used in matches
- stale disconnect markers — sweeper reconciles with the DB

## Scripts

| script | purpose |
|---|---|
| `npm run dev` | backend dev server (Next + Socket.IO) |
| `npm run workers` | BullMQ workers |
| `npm run seed` | seed users/problems/test cases |
| `npm run piston:install-packages` | install Piston language runtimes |
| `npm test` | unit tests (Elo, output normalization, sanitization) |
| `npm run lint` / `npx tsc --noEmit` | lint / typecheck |

## Env vars

See `.env.example`: `DATABASE_URL`, `PAYLOAD_SECRET`, `REDIS_URL`,
`PISTON_URL`, `JUDGE_PROVIDER`, `SERVER_URL`, `FRONTEND_URL`.
