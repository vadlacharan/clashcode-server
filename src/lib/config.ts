export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  payloadSecret: process.env.PAYLOAD_SECRET ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  pistonUrl: process.env.PISTON_URL ?? 'http://127.0.0.1:2000',
  // 'piston' (production, sandboxed) | 'local' (dev convenience, executes on the host)
  judgeProvider: (process.env.JUDGE_PROVIDER ?? 'piston') as 'piston' | 'local',
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
}

export const DEFAULT_RATING = 1200

// K-factor derived from problem difficulty — admins pick difficulty, never K.
export const ELO_K_BY_DIFFICULTY = {
  easy: 16,
  medium: 32,
  hard: 48,
  insane: 64,
} as const

export type Difficulty = keyof typeof ELO_K_BY_DIFFICULTY
export const DIFFICULTIES = Object.keys(ELO_K_BY_DIFFICULTY) as Difficulty[]

export const LANGUAGES = [
  { id: 'python', label: 'Python 3' },
  { id: 'javascript', label: 'JavaScript (Node.js)' },
  { id: 'cpp', label: 'C++' },
  { id: 'go', label: 'Go' },
] as const

export type LanguageId = (typeof LANGUAGES)[number]['id']
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as LanguageId[]

export const DISCONNECT_GRACE_MS = 75_000

export const MAX_CODE_LENGTH = 100_000

export const SUBMIT_MIN_INTERVAL_SEC = 10
export const SUBMIT_MAX_PER_MATCH = 50
export const RUN_RATE_LIMIT = { max: 20, windowSec: 60 }
export const JOIN_RATE_LIMIT = { max: 10, windowSec: 60 }

export const PISTON_DEFAULT_CPU_SECONDS = 5
export const PISTON_MAX_CPU_SECONDS = 15
export const PISTON_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024
export const PISTON_COMPILE_TIMEOUT_MS = 10_000

/** Main-file names per language — Piston executes the first file. */
export const PISTON_MAIN_FILE: Record<LanguageId, string> = {
  python: 'main.py',
  javascript: 'main.js',
  cpp: 'main.cpp',
  go: 'main.go',
}

/** Piston package names used to install language runtimes. */
export const PISTON_PACKAGES: Record<LanguageId, string> = {
  python: 'python',
  javascript: 'node',
  cpp: 'gcc',
  go: 'go',
}

export const MAX_STORED_STDOUT_LENGTH = 4_000
export const PROBLEM_HISTORY_EXCLUDE_COUNT = 3

export const KEYS = {
  queue: 'cc:queue',
  pqueue: (problemId: string) => `cc:pqueue:${problemId}`,
  pqueues: 'cc:pqueues',
  challenge: (id: string) => `cc:challenge:${id}`,
  challengesIn: (userId: string) => `cc:challenges:in:${userId}`,
  challengesOut: (userId: string) => `cc:challenges:out:${userId}`,
  inMatch: (userId: string) => `cc:inmatch:${userId}`,
  dc: (matchId: string, userId: string) => `cc:dc:${matchId}:${userId}`,
  sock: (matchId: string, userId: string) => `cc:sock:${matchId}:${userId}`,
  submitInterval: (userId: string) => `cc:subint:${userId}`,
  submitCount: (matchId: string, userId: string) => `cc:subcnt:${matchId}:${userId}`,
  runLimit: (userId: string) => `cc:runlimit:${userId}`,
  joinLimit: (userId: string) => `cc:joinlimit:${userId}`,
  challengeLimit: (userId: string) => `cc:challimit:${userId}`,
  runtimesCache: 'cc:piston:runtimes',
}

export const REDIS_KEY_TTL = {
  inMatch: 60 * 60 * 4,
  submitInterval: SUBMIT_MIN_INTERVAL_SEC,
  submitCount: 60 * 60 * 3,
  runtimesCache: 60 * 60 * 24,
}

/** Pending challenge lifetime in seconds. */
export const CHALLENGE_TTL_SEC = 120
export const CHALLENGE_RATE_LIMIT = { max: 10, windowSec: 60 }
