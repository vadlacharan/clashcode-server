import type { PayloadRequest } from 'payload'
import { claimFinish, refId } from '../lib/matchState'
import { participantSide, type MatchDoc } from '../lib/matchService'
import { readJson, badRequest, conflict, forbidden, notFound, requireUser, serverError, unauthorized } from './shared'

/**
 * POST /api/solve/start — body: { problemId }
 * Starts (or resumes) a solo practice session. Unrated: nothing here touches
 * Elo; finishing with an accepted submission records a 'solved' history entry.
 */
export async function startSolve(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const problemId = body.problemId ? String(body.problemId) : null
    if (!problemId) return badRequest('problemId is required')

    try {
      await req.payload.findByID({
        collection: 'problems',
        id: problemId,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      return notFound('Problem not found')
    }

    // One active session of any mode at a time.
    const { docs: active } = await req.payload.find({
      collection: 'matches',
      where: {
        and: [
          { status: { equals: 'active' } },
          {
            or: [{ playerOne: { equals: user.id } }, { playerTwo: { equals: user.id } }],
          },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (active.length > 0) {
      const existing = active[0] as unknown as MatchDoc & { mode?: string }
      const existingProblemId = String(refId(existing.problem))
      if (existing.mode === 'solo' && existingProblemId === problemId) {
        return Response.json({ matchId: String(existing.id), resumed: true })
      }
      return conflict('You already have an active session — finish it first')
    }

    const match = (await req.payload.create({
      collection: 'matches',
      data: {
        playerOne: Number(user.id),
        mode: 'solo',
        problem: Number(problemId),
        status: 'active',
        startedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      depth: 0,
    })) as unknown as MatchDoc

    const { setInMatchMarker } = await import('../lib/matchService')
    await setInMatchMarker([user.id], match.id, 60 * 60 * 4)

    return Response.json({ matchId: String(match.id), resumed: false })
  } catch (err) {
    console.error('[solve/start]', err)
    return serverError()
  }
}

/**
 * POST /api/solve/end — body: { matchId }
 * Ends a solo session without submitting ('abandoned' in history). No rating.
 */
export async function endSolve(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const matchId = body.matchId ? String(body.matchId) : null
    if (!matchId) return badRequest('matchId is required')

    let match: MatchDoc
    try {
      match = (await req.payload.findByID({
        collection: 'matches',
        id: matchId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as MatchDoc
    } catch {
      return notFound('Session not found')
    }

    if (match.status !== 'active') return forbidden('Session is not active')
    if (!participantSide(match, user.id)) return forbidden('Not your session')
    if ((match as { mode?: string }).mode !== 'solo') {
      return forbidden('Only solo sessions can be ended this way')
    }

    const claimed = await claimFinish(req.payload, matchId, { endReason: 'aborted' })
    if (!claimed) return forbidden('Session is not active')

    const { getRedis } = await import('../queues/connection')
    const { KEYS } = await import('../lib/config')
    await getRedis().del(KEYS.inMatch(user.id)).catch(() => undefined)

    const finishedPayload = {
      matchId,
      endReason: 'aborted',
      draw: true,
      winnerId: null,
      mode: 'solo' as const,
      ratings: null,
    }
    const { emitMatch, emitUser } = await import('../lib/events')
    emitMatch(matchId, 'match:finished', finishedPayload)
    emitUser(user.id, 'match:finished', finishedPayload)

    return Response.json({ ended: true })
  } catch (err) {
    console.error('[solve/end]', err)
    return serverError()
  }
}
