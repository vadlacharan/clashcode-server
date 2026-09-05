import type { PayloadRequest } from 'payload'
import { claimFinish, finalizeMatch, refId } from '../lib/matchState'
import { participantSide, type MatchDoc } from '../lib/matchService'
import { readJson, badRequest, forbidden, requireUser, serverError, unauthorized } from './shared'

/**
 * POST /api/match/forfeit
 * Body: { matchId }
 * Concedes the match — opponent wins, rating applies normally.
 */
export async function forfeitMatch(req: PayloadRequest): Promise<Response> {
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
      return badRequest('Match not found')
    }

    if (match.status !== 'active') return forbidden('Match is not active')
    if (!participantSide(match, user.id)) return forbidden('You are not a participant in this match')

    const winnerId = refId(match.playerOne) === user.id ? refId(match.playerTwo)! : refId(match.playerOne)!

    const claimed = await claimFinish(req.payload, matchId, {
      winnerId,
      endReason: 'forfeit',
    })
    if (!claimed) return forbidden('Match is no longer active')

    const problemId = refId(match.problem)
    let difficulty: 'easy' | 'medium' | 'hard' | 'insane' = 'medium'
    if (problemId) {
      const problem = (await req.payload.findByID({
        collection: 'problems',
        id: problemId,
        depth: 0,
        overrideAccess: true,
      })) as { difficulty?: string }
      difficulty = (problem.difficulty ?? 'medium') as typeof difficulty
    }

    await finalizeMatch(req.payload, {
      matchId,
      playerOneId: refId(match.playerOne)!,
      playerTwoId: refId(match.playerTwo)!,
      endReason: 'forfeit',
      winnerId,
      difficulty,
    })

    return Response.json({ forfeited: true, winnerId })
  } catch (err) {
    console.error('[match/forfeit]', err)
    return serverError()
  }
}
