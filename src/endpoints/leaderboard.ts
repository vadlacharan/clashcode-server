import type { PayloadRequest } from 'payload'
import { requireUser, serverError, unauthorized } from './shared'

/**
 * GET /api/leaderboard
 * Top players by rating. All authenticated users may view.
 */
export async function leaderboard(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const url = req.searchParams
    const limit = Math.min(100, Math.max(1, Number(url.get('limit')) || 50))

    const { docs } = await req.payload.find({
      collection: 'users',
      where: { role: { not_equals: 'admin' } },
      sort: '-rating',
      limit,
      depth: 0,
      overrideAccess: true,
      select: {
        username: true,
        rating: true,
        wins: true,
        losses: true,
        draws: true,
      },
    })

    return Response.json({
      leaderboard: docs.map((u, i) => ({
        rank: i + 1,
        id: String(u.id),
        username: (u as { username?: string }).username ?? null,
        rating: Number((u as { rating?: number }).rating) || 0,
        wins: Number((u as { wins?: number }).wins) || 0,
        losses: Number((u as { losses?: number }).losses) || 0,
        draws: Number((u as { draws?: number }).draws) || 0,
      })),
    })
  } catch (err) {
    console.error('[leaderboard]', err)
    return serverError()
  }
}
