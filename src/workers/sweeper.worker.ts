import type { Payload } from 'payload'
import { KEYS } from '../lib/config'
import { refId, claimFinish, finalizeMatch } from '../lib/matchState'
import type { MatchDoc } from '../lib/matchService'
import { getRedis } from '../queues/connection'

const SWEEP_LIMIT = 100

export async function runSweepOnce(payload: Payload): Promise<void> {
  const { docs: active } = await payload.find({
    collection: 'matches',
    where: { status: { equals: 'active' } },
    limit: SWEEP_LIMIT,
    depth: 0,
    sort: 'createdAt',
    overrideAccess: true,
  })

  const redis = getRedis()

  for (const raw of active) {
    const match = raw as unknown as MatchDoc
    const matchId = String(match.id)
    const playerOneId = refId(match.playerOne)
    const playerTwoId = refId(match.playerTwo)
    if (!playerOneId || !playerTwoId) continue

    // Solo sessions never time out or forfeit — the player ends them manually.
    if (match.mode === 'solo') continue

    try {
      // 1) Match timeout -> draw
      if (match.startedAt) {
        const problemId = refId(match.problem)
        if (problemId) {
          const problem = (await payload.findByID({
            collection: 'problems',
            id: problemId,
            depth: 0,
            overrideAccess: true,
          })) as { difficulty?: string; timeLimitSeconds?: number }
          const timeLimitMs = (Number(problem.timeLimitSeconds) || 900) * 1000
          const endsAt = new Date(match.startedAt).getTime() + timeLimitMs
          if (Date.now() > endsAt) {
            const claimed = await claimFinish(payload, matchId, { endReason: 'timeout' })
            if (claimed) {
              await finalizeMatch(payload, {
                matchId,
                playerOneId,
                playerTwoId,
                endReason: 'timeout',
                winnerId: null,
                difficulty: (problem.difficulty ?? 'medium') as
                  | 'easy'
                  | 'medium'
                  | 'hard'
                  | 'insane',
              })
              console.info(`[sweeper] match ${matchId} ended in a draw (timeout)`)
              continue
            }
          }
        }
      }

      // 2) Disconnect grace expired -> forfeit
      for (const [userId, otherId] of [
        [playerOneId, playerTwoId],
        [playerTwoId, playerOneId],
      ] as const) {
        const expiryRaw = await redis.get(KEYS.dc(matchId, userId))
        if (expiryRaw && Date.now() > Number(expiryRaw)) {
          const claimed = await claimFinish(payload, matchId, {
            winnerId: otherId,
            endReason: 'forfeit',
          })
          if (claimed) {
            const problemId = refId(match.problem)
            let difficulty: 'easy' | 'medium' | 'hard' | 'insane' = 'medium'
            if (problemId) {
              const problem = (await payload.findByID({
                collection: 'problems',
                id: problemId,
                depth: 0,
                overrideAccess: true,
              })) as { difficulty?: string }
              difficulty = (problem.difficulty ?? 'medium') as typeof difficulty
            }
            await finalizeMatch(payload, {
              matchId,
              playerOneId,
              playerTwoId,
              endReason: 'forfeit',
              winnerId: otherId,
              difficulty,
            })
            console.info(`[sweeper] match ${matchId}: ${userId} forfeited (disconnect)`)
            break
          }
        }
      }
    } catch (err) {
      console.error(`[sweeper] error while sweeping match ${matchId}`, err)
    }
  }
}
