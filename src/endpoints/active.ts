import type { PayloadRequest } from 'payload'
import { getActiveMatchForUser } from '../lib/matchService'
import { requireUser, serverError, unauthorized } from './shared'

export async function activeMatch(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const match = await getActiveMatchForUser(req.payload, user.id)
    return Response.json({ matchId: match ? String(match.id) : null })
  } catch (err) {
    console.error('[match/active]', err)
    return serverError()
  }
}
