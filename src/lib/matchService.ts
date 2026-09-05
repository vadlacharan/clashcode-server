import type { Payload } from 'payload'
import {
  DISCONNECT_GRACE_MS,
  KEYS,
  PROBLEM_HISTORY_EXCLUDE_COUNT,
  REDIS_KEY_TTL,
} from './config'
import { refId, type PlayerStats } from './matchState'
import { emitUser } from './events'
import { getRedis } from '../queues/connection'

export type MatchDoc = {
  id: string | number
  playerOne: string | number | { id: string | number }
  playerTwo: string | number | { id: string | number }
  problem: string | number | { id: string | number }
  status: string
  endReason?: string | null
  winner?: string | number | { id: string | number } | null
  startedAt?: string | null
  endedAt?: string | null
  playerOneStats?: PlayerStats | null
  playerTwoStats?: PlayerStats | null
  ratings?: {
    playerOne: { before: number; after: number; delta: number }
    playerTwo: { before: number; after: number; delta: number }
  } | null
} & Record<string, unknown>

export function participantSide(
  match: Pick<MatchDoc, 'playerOne' | 'playerTwo'>,
  userId: string,
): 'playerOne' | 'playerTwo' | null {
  if (refId(match.playerOne) === userId) return 'playerOne'
  if (refId(match.playerTwo) === userId) return 'playerTwo'
  return null
}

export async function getActiveMatchForUser(
  payload: Payload,
  userId: string,
): Promise<MatchDoc | null> {
  // Fast path: redis marker set at match creation.
  const marker = await getRedis().get(KEYS.inMatch(userId)).catch(() => null)
  if (!marker) return null
  const match = (await payload.findByID({
    collection: 'matches',
    id: marker,
    depth: 0,
    overrideAccess: true,
  })) as unknown as MatchDoc
  if (match && match.status === 'active') return match
  return null
}

/** Validates the user actually participates in the given match. */
export async function getMatchForParticipant(
  payload: Payload,
  matchId: string | number,
  userId: string,
): Promise<MatchDoc | null> {
  let match: MatchDoc
  try {
    match = (await payload.findByID({
      collection: 'matches',
      id: matchId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as MatchDoc
  } catch {
    return null
  }
  if (!match) return null
  if (!participantSide(match, userId)) return null
  return match
}

/**
 * Picks a random problem, avoiding problems either player has played in their
 * last few matches. Falls back to the full pool if that would empty it.
 */
export async function pickProblem(
  payload: Payload,
  playerIds: string[],
): Promise<{ id: string; timeLimitSeconds: number } | null> {
  const { docs } = await payload.find({
    collection: 'problems',
    limit: 200,
    depth: 0,
    sort: '-createdAt',
    overrideAccess: true,
  })
  if (docs.length === 0) return null

  const { docs: recent } = await payload.find({
    collection: 'matches',
    where: {
      or: [
        { playerOne: { in: playerIds } },
        { playerTwo: { in: playerIds } },
      ],
    },
    sort: '-createdAt',
    limit: PROBLEM_HISTORY_EXCLUDE_COUNT * playerIds.length,
    depth: 0,
    overrideAccess: true,
  })
  const recentProblemIds = new Set(recent.map((m) => refId((m as unknown as MatchDoc).problem)))

  const fresh = docs.filter((p) => !recentProblemIds.has(String(p.id)))
  const pool = fresh.length > 0 ? fresh : docs
  const chosen = pool[Math.floor(Math.random() * pool.length)]
  return {
    id: String(chosen.id),
    timeLimitSeconds: Number(chosen.timeLimitSeconds) || 900,
  }
}

export async function setInMatchMarker(
  userIds: string[],
  matchId: string | number,
  ttlSeconds: number,
): Promise<void> {
  const redis = getRedis()
  await Promise.all(
    userIds.map((id) =>
      redis.set(KEYS.inMatch(id), String(matchId), 'EX', ttlSeconds).catch(() => undefined),
    ),
  )
}

export type PlayerProgress = {
  userId: string
  username: string | null
  rating: number
  stats: PlayerStats
}

export function buildProgressPayload(
  players: { userId: string; username: string | null; rating: number }[],
  stats: { playerOne: PlayerStats; playerTwo: PlayerStats },
  playerOneId: string,
): { playerOne: PlayerProgress; playerTwo: PlayerProgress } {
  const findUser = (userId: string) => players.find((p) => p.userId === userId) ?? {
    userId,
    username: null,
    rating: 0,
  }
  const one = findUser(playerOneId)
  const two = players.find((p) => p.userId !== playerOneId) ?? one
  return {
    playerOne: { ...one, stats: stats.playerOne },
    playerTwo: { ...two, stats: stats.playerTwo },
  }
}

export function parseBody(req: { json?: () => Promise<unknown> }): Promise<Record<string, unknown>> {
  if (typeof req.json !== 'function') return Promise.resolve({})
  return req
    .json()
    .then((v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {}))
    .catch(() => ({}))
}

/**
 * Creates a match between two players for a given problem, marks both as
 * in-match in Redis and notifies them over Socket.IO. Shared by the
 * matchmaker worker and the challenge-accept flow.
 */
export async function createMatchForPlayers(
  payload: Payload,
  opts: {
    playerOneId: string
    playerTwoId: string
    problemId: string
    timeLimitSeconds: number
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const match = await payload.create({
    collection: 'matches',
    data: {
      playerOne: Number(opts.playerOneId),
      playerTwo: Number(opts.playerTwoId),
      problem: Number(opts.problemId),
      status: 'active',
      startedAt: new Date().toISOString(),
    },
    overrideAccess: true,
    depth: 0,
  })

  const markerTtl = Math.min(
    opts.timeLimitSeconds + Math.ceil(DISCONNECT_GRACE_MS / 1000) + 60,
    REDIS_KEY_TTL.inMatch,
  )
  await setInMatchMarker([opts.playerOneId, opts.playerTwoId], match.id, markerTtl)

  emitUser(opts.playerOneId, 'match:start', { matchId: String(match.id) })
  emitUser(opts.playerTwoId, 'match:start', { matchId: String(match.id) })
  return match
}
