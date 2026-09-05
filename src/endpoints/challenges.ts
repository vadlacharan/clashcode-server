import type { PayloadRequest } from 'payload'
import { randomUUID } from 'node:crypto'
import { CHALLENGE_RATE_LIMIT, CHALLENGE_TTL_SEC, KEYS } from '../lib/config'
import {
  createChallenge,
  pendingChallengesFor,
  takeChallenge,
  type Challenge,
} from '../lib/challenges'
import { createMatchForPlayers, getActiveMatchForUser, type MatchDoc } from '../lib/matchService'
import { emitUser } from '../lib/events'
import { rateLimit } from '../lib/rateLimit'
import { getJudgeQueue } from '../queues/judgeQueue'
import { readJson, badRequest, conflict, forbidden, notFound, requireUser, serverError, tooMany, unauthorized } from './shared'

const SEND_QUEUE_NAME = 'cc-challenges'

function challengeView(c: Challenge) {
  return {
    id: c.id,
    from: { id: c.fromId, username: c.fromUsername, rating: c.fromRating },
    to: { id: c.toId, username: c.toUsername },
    problem: {
      id: c.problemId,
      title: c.problemTitle,
      difficulty: c.problemDifficulty,
      timeLimitSeconds: c.timeLimitSeconds,
    },
    createdAt: c.createdAt,
    expiresAt: c.createdAt + CHALLENGE_TTL_SEC * 1000,
  }
}

/** POST /api/challenges/send — body: { toUserId | toUsername, problemId } */
export async function sendChallenge(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const problemId = body.problemId ? String(body.problemId) : null
    const toUserId = body.toUserId ? String(body.toUserId) : null
    const toUsername = body.toUsername ? String(body.toUsername).trim() : null
    if (!problemId) return badRequest('problemId is required')
    if (!toUserId && !toUsername) return badRequest('toUserId or toUsername is required')

    const allowed = await rateLimit(KEYS.challengeLimit(user.id), CHALLENGE_RATE_LIMIT.max, CHALLENGE_RATE_LIMIT.windowSec)
    if (!allowed) return tooMany('Too many challenges sent — slow down')

    // Validate problem
    let problem: { id: string; title: string; difficulty: string; timeLimitSeconds: number }
    try {
      const doc = await req.payload.findByID({
        collection: 'problems',
        id: problemId,
        depth: 0,
        overrideAccess: true,
      })
      problem = {
        id: String(doc.id),
        title: (doc as { title: string }).title,
        difficulty: (doc as { difficulty: string }).difficulty,
        timeLimitSeconds: Number((doc as { timeLimitSeconds: number }).timeLimitSeconds) || 900,
      }
    } catch {
      return notFound('Problem not found')
    }

    // Resolve opponent
    let opponent: { id: string; username: string; rating: number } | null = null
    try {
      const doc = toUserId
        ? await req.payload.findByID({ collection: 'users', id: toUserId, depth: 0, overrideAccess: true })
        : (
            await req.payload.find({
              collection: 'users',
              where: { username: { equals: toUsername! } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
          ).docs[0]
      if (doc) {
        opponent = {
          id: String(doc.id),
          username: (doc as { username: string }).username,
          rating: Number((doc as { rating?: number }).rating) || 0,
        }
      }
    } catch {
      opponent = null
    }
    if (!opponent) return notFound('Player not found')
    if (opponent.id === user.id) return badRequest('You cannot challenge yourself')

    const me = await req.payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 0,
      overrideAccess: true,
    })

    // Both players must be free
    const [myActive, theirActive] = await Promise.all([
      getActiveMatchForUser(req.payload, user.id),
      getActiveMatchForUser(req.payload, opponent.id),
    ])
    if (myActive) return conflict('You are already in an active match')
    if (theirActive) return conflict(`${opponent.username} is already in an active match`)

    const challenge: Challenge = {
      id: randomUUID(),
      fromId: user.id,
      fromUsername: (me as { username: string }).username,
      fromRating: Number((me as { rating?: number }).rating) || 0,
      toId: opponent.id,
      toUsername: opponent.username,
      problemId: problem.id,
      problemTitle: problem.title,
      problemDifficulty: problem.difficulty,
      timeLimitSeconds: problem.timeLimitSeconds,
      createdAt: Date.now(),
    }

    // One pending incoming challenge per player — replace any previous one.
    const previous = await pendingChallengesFor(opponent.id)
    for (const p of previous.incoming) {
      await takeChallenge(p.id).catch(() => undefined)
      emitUser(p.fromId, 'challenge:expired', { challengeId: p.id })
    }

    await createChallenge(challenge)

    // Schedule the expiry notification a few seconds BEFORE the Redis TTL
    // elapses, so reapChallenge still finds the challenge and can notify both
    // sides (the job itself removes the key, winning the race against the TTL).
    await getJudgeQueue().add(
      'challenge-expiry',
      { challengeId: challenge.id },
      {
        delay: Math.max(5, CHALLENGE_TTL_SEC - 3) * 1000,
        removeOnComplete: 50,
        removeOnFail: 50,
        jobId: `chall-exp-${challenge.id}`,
      },
    )

    emitUser(opponent.id, 'challenge:incoming', challengeView(challenge))

    return Response.json({ sent: true, challenge: challengeView(challenge) })
  } catch (err) {
    console.error('[challenges/send]', err)
    return serverError()
  }
}

/** POST /api/challenges/accept — body: { challengeId } */
export async function acceptChallenge(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const challengeId = body.challengeId ? String(body.challengeId) : null
    if (!challengeId) return badRequest('challengeId is required')

    const challenge = await takeChallenge(challengeId)
    if (!challenge) return notFound('Challenge no longer available (expired or already handled)')
    if (challenge.toId !== user.id) return forbidden('This challenge is not yours')

    const [myActive, theirActive] = await Promise.all([
      getActiveMatchForUser(req.payload, user.id),
      getActiveMatchForUser(req.payload, challenge.fromId),
    ])
    if (myActive) {
      emitUser(challenge.fromId, 'challenge:expired', { challengeId })
      return conflict('You are already in an active match')
    }
    if (theirActive) {
      emitUser(challenge.fromId, 'challenge:expired', { challengeId })
      return conflict('The challenger is already in an active match')
    }

    const match = (await createMatchForPlayers(req.payload, {
      playerOneId: challenge.fromId,
      playerTwoId: challenge.toId,
      problemId: challenge.problemId,
      timeLimitSeconds: challenge.timeLimitSeconds,
    })) as MatchDoc

    emitUser(challenge.fromId, 'challenge:accepted', { challengeId, matchId: String(match.id) })

    return Response.json({ accepted: true, matchId: String(match.id) })
  } catch (err) {
    console.error('[challenges/accept]', err)
    return serverError()
  }
}

/** POST /api/challenges/decline — body: { challengeId } */
export async function declineChallenge(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const challengeId = body.challengeId ? String(body.challengeId) : null
    if (!challengeId) return badRequest('challengeId is required')

    const challenge = await takeChallenge(challengeId)
    if (!challenge) return notFound('Challenge no longer available')
    if (challenge.toId !== user.id) return forbidden('This challenge is not yours')

    emitUser(challenge.fromId, 'challenge:declined', {
      challengeId,
      byUsername: (challenge.toUsername ?? '').length > 0 ? challenge.toUsername : undefined,
    })
    return Response.json({ declined: true })
  } catch (err) {
    console.error('[challenges/decline]', err)
    return serverError()
  }
}

/** POST /api/challenges/cancel — body: { challengeId } (sender cancels) */
export async function cancelChallenge(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const challengeId = body.challengeId ? String(body.challengeId) : null
    if (!challengeId) return badRequest('challengeId is required')

    const challenge = await takeChallenge(challengeId)
    if (!challenge) return notFound('Challenge no longer available')
    if (challenge.fromId !== user.id) return forbidden('This challenge is not yours')

    emitUser(challenge.toId, 'challenge:removed', { challengeId })
    return Response.json({ cancelled: true })
  } catch (err) {
    console.error('[challenges/cancel]', err)
    return serverError()
  }
}

/** GET /api/challenges/pending — incoming + outgoing for the caller */
export async function pendingChallenges(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const { incoming, outgoing } = await pendingChallengesFor(user.id)
    return Response.json({
      incoming: incoming.map(challengeView),
      outgoing: outgoing.map(challengeView),
    })
  } catch (err) {
    console.error('[challenges/pending]', err)
    return serverError()
  }
}

export { SEND_QUEUE_NAME }
