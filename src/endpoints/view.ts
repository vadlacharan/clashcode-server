import type { PayloadRequest } from 'payload'
import { DEFAULT_RATING, MAX_CODE_LENGTH } from '../lib/config'
import { refId, type PlayerStats } from '../lib/matchState'
import { participantSide, type MatchDoc } from '../lib/matchService'
import { submissionViewFor } from '../lib/sanitize'
import { badRequest, notFound, requireUser, serverError, unauthorized } from './shared'

const emptyStats = (): PlayerStats => ({ submissions: 0, passed: 0, total: 0, lastStatus: null })

/**
 * GET /api/match/view?matchId=...
 * Everything the match page needs in one sanitized payload.
 * Hidden test data never leaves the server through this endpoint.
 */
export async function viewMatch(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const url = req.searchParams
    const matchId = url.get('matchId')
    if (!matchId) return badRequest('matchId is required')

    // Only participants can view a match.
    let match: MatchDoc
    try {
      match = (await req.payload.findByID({
        collection: 'matches',
        id: matchId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as MatchDoc
    } catch {
      return notFound('Match not found')
    }

    const side = participantSide(match, user.id)
    if (!side) return notFound('Match not found')

    const playerOneId = refId(match.playerOne)!
    const playerTwoId = refId(match.playerTwo)!
    const myId = user.id
    const opponentId = side === 'playerOne' ? playerTwoId : playerOneId

    const [me, opponent] = await Promise.all([
      req.payload.findByID({ collection: 'users', id: myId, depth: 0, overrideAccess: true }),
      req.payload.findByID({ collection: 'users', id: opponentId, depth: 0, overrideAccess: true }),
    ])

    const problemId = refId(match.problem)
    const problem = (await req.payload.findByID({
      collection: 'problems',
      id: problemId!,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const { docs: allTests } = await req.payload.find({
      collection: 'test-cases',
      where: { problem: { equals: problemId } },
      limit: 200,
      sort: 'order',
      depth: 0,
      overrideAccess: true,
    })
    const publicTests = allTests
      .filter((t) => (t as { isPublic?: boolean }).isPublic)
      .map((t) => ({
        label: (t as { label?: string }).label ?? null,
        input: (t as { input?: string }).input ?? '',
        expectedOutput: (t as { expectedOutput?: string }).expectedOutput ?? '',
      }))

    const { docs: mySubmissions } = await req.payload.find({
      collection: 'submissions',
      where: { and: [{ match: { equals: matchId } }, { author: { equals: myId } }] },
      sort: '-createdAt',
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })

    const rawOneStats = (match.playerOneStats as PlayerStats | null) ?? emptyStats()
    const rawTwoStats = (match.playerTwoStats as PlayerStats | null) ?? emptyStats()

    const player = {
      userId: myId,
      username: (me as { username?: string }).username ?? null,
      rating: Number((me as { rating?: number }).rating) || DEFAULT_RATING,
      stats: side === 'playerOne' ? rawOneStats : rawTwoStats,
    }
    const opponentPlayer = {
      userId: opponentId,
      username: (opponent as { username?: string }).username ?? null,
      rating: Number((opponent as { rating?: number }).rating) || DEFAULT_RATING,
      stats: side === 'playerOne' ? rawTwoStats : rawOneStats,
    }

    return Response.json({
      serverTime: new Date().toISOString(),
      match: {
        id: String(match.id),
        status: match.status,
        endReason: match.endReason ?? null,
        startedAt: match.startedAt ?? null,
        endedAt: match.endedAt ?? null,
        winnerId: match.winner ? refId(match.winner as never) : null,
        ratings: match.ratings ?? null,
        timeLimitSeconds: Number(problem.timeLimitSeconds) || 900,
      },
      me: player,
      opponent: opponentPlayer,
      mySide: side,
      problem: {
        id: String(problem.id),
        title: problem.title,
        statement: problem.statement,
        constraints: problem.constraints ?? null,
        difficulty: problem.difficulty,
        starterTemplates: (problem.starterTemplates as { language: string; code: string }[]) ?? [],
        totalTests: allTests.length,
        publicTests,
        maxCodeLength: MAX_CODE_LENGTH,
      },
      mySubmissions: mySubmissions.map((s) => submissionViewFor(s, true)),
    })
  } catch (err) {
    console.error('[match/view]', err)
    return serverError()
  }
}
