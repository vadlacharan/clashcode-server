import type { PayloadRequest } from 'payload'
import { refId, type MatchRatings } from '../lib/matchState'
import type { MatchDoc } from '../lib/matchService'
import { requireUser, serverError, unauthorized } from './shared'

type UserLite = { id: string | number; username?: string; rating?: number }

/**
 * GET /api/match/history?page=1
 * The authenticated player's past matches with opponent, problem, result and
 * rating delta.
 */
export async function matchHistory(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const url = req.searchParams
    const page = Math.max(1, Number(url.get('page')) || 1)

    const result = await req.payload.find({
      collection: 'matches',
      where: {
        and: [
          { status: { in: ['finished', 'aborted'] } },
          {
            or: [
              { playerOne: { equals: user.id } },
              { playerTwo: { equals: user.id } },
            ],
          },
        ],
      },
      sort: '-createdAt',
      page,
      limit: 20,
      depth: 0,
      overrideAccess: true,
    })

    const matches = result.docs as unknown as MatchDoc[]

    // Bulk-load opponents + problems for display.
    const opponentIds = [...new Set(matches.map((m) => (refId(m.playerOne) === user.id ? refId(m.playerTwo)! : refId(m.playerOne)!)))]
    const problemIds = [...new Set(matches.map((m) => String(refId(m.problem))))]

    const opponents = new Map<string, UserLite>()
    if (opponentIds.length > 0) {
      const { docs } = await req.payload.find({
        collection: 'users',
        where: { id: { in: opponentIds } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of docs) {
        opponents.set(String(doc.id), doc as UserLite)
      }
    }

    const problems = new Map<string, { title?: string; difficulty?: string }>()
    if (problemIds.length > 0) {
      const { docs } = await req.payload.find({
        collection: 'problems',
        where: { id: { in: problemIds } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of docs) {
        problems.set(String(doc.id), doc as { title?: string; difficulty?: string })
      }
    }

    const history = matches.map((m) => {
      const mode = (m as { mode?: string }).mode ?? 'duel'
      const isSolo = mode === 'solo'
      const mySideIsOne = refId(m.playerOne) === user.id
      const opponentId = isSolo ? null : mySideIsOne ? refId(m.playerTwo)! : refId(m.playerOne)!
      const opponent = opponentId != null ? opponents.get(opponentId) : undefined
      const problem = problems.get(String(refId(m.problem)))
      const winnerId = m.winner ? refId(m.winner as never) : null
      const ratings = (m.ratings ?? null) as MatchRatings | null
      const myRatings = ratings ? (mySideIsOne ? ratings.playerOne : ratings.playerTwo) : null

      const result =
        m.status === 'aborted'
          ? 'abandoned'
          : isSolo
            ? m.endReason === 'solved'
              ? 'solved'
              : 'abandoned'
            : !winnerId
              ? 'draw'
              : winnerId === user.id
                ? 'win'
                : 'loss'

      return {
        id: String(m.id),
        mode,
        status: m.status,
        endReason: m.endReason ?? null,
        result,
        createdAt: m.createdAt ?? null,
        endedAt: m.endedAt ?? null,
        opponent: opponent
          ? {
              id: opponentId!,
              username: opponent.username ?? null,
              rating: Number(opponent.rating) || null,
            }
          : null,
        problem: {
          id: String(refId(m.problem)),
          title: problem?.title ?? null,
          difficulty: problem?.difficulty ?? null,
        },
        ratingDelta: myRatings ? myRatings.delta : null,
        ratingAfter: myRatings ? myRatings.after : null,
      }
    })

    return Response.json({
      history,
      page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    })
  } catch (err) {
    console.error('[match/history]', err)
    return serverError()
  }
}
