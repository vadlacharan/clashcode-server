import type { Payload } from 'payload'
import {
  DEFAULT_RATING,
  ELO_K_BY_DIFFICULTY,
  KEYS,
  type Difficulty,
} from './config'
import { eloDelta } from './rating'
import { emitMatch, emitUser } from './events'
import { getRedis } from '../queues/connection'

export type PlayerStats = {
  submissions: number
  passed: number
  total: number
  lastStatus: string | null
}

export type MatchRatings = {
  playerOne: { before: number; after: number; delta: number }
  playerTwo: { before: number; after: number; delta: number }
}

 
export const emptyPlayerStats = (): PlayerStats => ({
  submissions: 0,
  passed: 0,
  total: 0,
  lastStatus: null,
})

type RefLike = string | number | { id: string | number } | null | undefined

export const refId = (ref: RefLike): string | null => {
  if (ref == null) return null
  if (typeof ref === 'object') return String((ref as { id: string | number }).id)
  return String(ref)
}

export const otherPlayerId = (match: { playerOne: RefLike; playerTwo: RefLike }, userId: string): string => {
  return refId(match.playerOne) === userId ? refId(match.playerTwo)! : refId(match.playerOne)!
}

/**
 * Atomically transitions an active match to finished. Only ONE concurrent
 * caller can win the claim because the update carries a `status = 'active'`
 * condition — the database serializes this, so the first accepted submission
 * wins and any racer gets `null` back.
 */
export async function claimFinish(
  payload: Payload,
  matchId: string | number,
  opts: { winnerId?: string | null; endReason: 'solved' | 'timeout' | 'forfeit' | 'aborted' },
): Promise<{ id: string | number; playerOne: RefLike; playerTwo: RefLike } | null> {
  const data: Record<string, unknown> = {
    status: 'finished',
    endedAt: new Date().toISOString(),
    endReason: opts.endReason,
  }
  if (opts.winnerId) {
    // NOTE: relationship values in update-with-where data must be numeric ids —
    // Payload's updateMany silently matches nothing when given strings.
    data.winner = Number(opts.winnerId)
  }

  const result = await payload.update({
    collection: 'matches',
    where: {
      and: [{ id: { equals: matchId } }, { status: { equals: 'active' } }],
    },
    data,
    overrideAccess: true,
    depth: 0,
  })

  const docs = (result as { docs?: unknown[] }).docs
  const claimed = Array.isArray(docs) && docs.length > 0 ? (docs[0] as {
    id: string | number
    playerOne: RefLike
    playerTwo: RefLike
  }) : null
  if (!claimed) {
    console.warn(`[claimFinish] no rows claimed for match ${matchId} (endReason=${opts.endReason})`)
  }
  return claimed
}

export type FinalizeInput = {
  matchId: string | number
  playerOneId: string
  playerTwoId: string
  endReason: 'solved' | 'timeout' | 'forfeit' | 'aborted'
  winnerId: string | null
  difficulty: Difficulty
}

/**
 * Applies Elo rating changes + W/L/D counters for a claimed match, persists
 * the rating snapshot, cleans up redis match state and notifies both players.
 */
export async function finalizeMatch(payload: Payload, input: FinalizeInput): Promise<void> {
  const { matchId, playerOneId, playerTwoId, endReason, winnerId, difficulty } = input
  const k = ELO_K_BY_DIFFICULTY[difficulty] ?? 32
  const isDraw = !winnerId || endReason === 'timeout'

  const [one, two] = await Promise.all([
    payload.findByID({ collection: 'users', id: playerOneId, overrideAccess: true, depth: 0 }),
    payload.findByID({ collection: 'users', id: playerTwoId, overrideAccess: true, depth: 0 }),
  ])

  const oneBefore = typeof one.rating === 'number' ? one.rating : DEFAULT_RATING
  const twoBefore = typeof two.rating === 'number' ? two.rating : DEFAULT_RATING

  let ratings: MatchRatings
  if (isDraw) {
    ratings = {
      playerOne: { before: oneBefore, after: oneBefore, delta: 0 },
      playerTwo: { before: twoBefore, after: twoBefore, delta: 0 },
    }
  } else {
    const oneIsWinner = winnerId === playerOneId
    const oneDelta = eloDelta(oneBefore, twoBefore, oneIsWinner ? 1 : 0, k)
    const twoDelta = -oneDelta
    ratings = {
      playerOne: { before: oneBefore, after: oneBefore + oneDelta, delta: oneDelta },
      playerTwo: { before: twoBefore, after: twoBefore + twoDelta, delta: twoDelta },
    }
  }

  // Persist rating snapshot on the match, then apply to users.
  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { ratings },
    overrideAccess: true,
    depth: 0,
  })

  if (isDraw) {
    await Promise.all([
      payload.update({
        collection: 'users',
        id: playerOneId,
        data: { draws: (Number(one.draws) || 0) + 1 },
        overrideAccess: true,
        depth: 0,
      }),
      payload.update({
        collection: 'users',
        id: playerTwoId,
        data: { draws: (Number(two.draws) || 0) + 1 },
        overrideAccess: true,
        depth: 0,
      }),
    ])
  } else {
    const oneIsWinner = winnerId === playerOneId
    await Promise.all([
      payload.update({
        collection: 'users',
        id: playerOneId,
        data: {
          rating: ratings.playerOne.after,
          wins: oneIsWinner ? (Number(one.wins) || 0) + 1 : Number(one.wins) || 0,
          losses: oneIsWinner ? Number(one.losses) || 0 : (Number(one.losses) || 0) + 1,
        },
        overrideAccess: true,
        depth: 0,
      }),
      payload.update({
        collection: 'users',
        id: playerTwoId,
        data: {
          rating: ratings.playerTwo.after,
          wins: oneIsWinner ? Number(two.wins) || 0 : (Number(two.wins) || 0) + 1,
          losses: oneIsWinner ? (Number(two.losses) || 0) + 1 : Number(two.losses) || 0,
        },
        overrideAccess: true,
        depth: 0,
      }),
    ])
  }

  const redis = getRedis()
  await Promise.all([
    redis.del(KEYS.inMatch(playerOneId)),
    redis.del(KEYS.inMatch(playerTwoId)),
    redis.del(KEYS.dc(String(matchId), playerOneId)),
    redis.del(KEYS.dc(String(matchId), playerTwoId)),
    redis.del(KEYS.sock(String(matchId), playerOneId)),
    redis.del(KEYS.sock(String(matchId), playerTwoId)),
  ]).catch(() => undefined)

  const finishedPayload = {
    matchId: String(matchId),
    endReason,
    draw: isDraw,
    winnerId: winnerId ? String(winnerId) : null,
    ratings,
  }
  emitMatch(String(matchId), 'match:finished', finishedPayload)
  emitUser(playerOneId, 'match:finished', finishedPayload)
  emitUser(playerTwoId, 'match:finished', finishedPayload)
}
