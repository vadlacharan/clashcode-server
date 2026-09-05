import type { PayloadRequest } from 'payload'
import { JOIN_RATE_LIMIT, KEYS } from '../lib/config'
import { getActiveMatchForUser } from '../lib/matchService'
import { rateLimit } from '../lib/rateLimit'
import { joinQueue, queueSize } from '../matchmaking/queue'
import { badRequest, conflict, readJson, requireUser, serverError, tooMany, unauthorized } from './shared'

export async function joinMatchmaking(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const problemId = body.problemId ? String(body.problemId) : null

    if (problemId) {
      try {
        await req.payload.findByID({
          collection: 'problems',
          id: problemId,
          depth: 0,
          overrideAccess: true,
        })
      } catch {
        return badRequest('Problem not found')
      }
    }

    const allowed = await rateLimit(KEYS.joinLimit(user.id), JOIN_RATE_LIMIT.max, JOIN_RATE_LIMIT.windowSec)
    if (!allowed) return tooMany('Slow down — matchmaking requests are rate limited')

    const active = await getActiveMatchForUser(req.payload, user.id)
    if (active) {
      return conflict(`You are already in an active match (matchId: ${active.id})`)
    }

    const added = await joinQueue(user.id, problemId ?? undefined)
    return Response.json({
      queued: true,
      alreadyQueued: !added,
      queueSize: await queueSize(problemId ?? undefined),
      problemId,
    })
  } catch (err) {
    console.error('[matchmaking/join]', err)
    return badRequest('Could not join matchmaking')
  }
}

export async function leaveMatchmaking(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const problemId = body.problemId ? String(body.problemId) : undefined
    const { leaveQueue } = await import('../matchmaking/queue')
    await leaveQueue(user.id, problemId)
    return Response.json({ queued: false, problemId: problemId ?? null })
  } catch (err) {
    console.error('[matchmaking/leave]', err)
    return serverError()
  }
}
