import type { Payload } from 'payload'
import { KEYS } from '../lib/config'
import { createMatchForPlayers, pickProblem } from '../lib/matchService'
import { activeProblemQueues, joinQueue, popPairFrom, reQueue } from '../matchmaking/queue'
import { getRedis } from '../queues/connection'

void joinQueue

async function activeMatchIdInDb(payload: Payload, userId: string): Promise<string | null> {
  const { docs } = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { status: { equals: 'active' } },
        {
          or: [{ playerOne: { equals: userId } }, { playerTwo: { equals: userId } }],
        },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs.length > 0 ? String(docs[0].id) : null
}

type Pair = { userId: string; joinedAt: number }

/**
 * Shared pairing guard: players holding an in-match marker are excluded, the
 * free ones are re-queued on `queueKey`.
 */
async function filterFreePlayers(
  payload: Payload,
  pair: Pair[],
  queueKey: string,
): Promise<Pair[]> {
  const redis = getRedis()
  const free: Pair[] = []
  for (const entry of pair) {
    const marker = await redis.get(KEYS.inMatch(entry.userId)).catch(() => null)
    if (!marker) free.push(entry)
  }

  if (free.length === pair.length) {
    // All free — run the defensive DB check (covers stale/missing markers).
    const actives = await Promise.all(free.map((p) => activeMatchIdInDb(payload, p.userId)))
    if (actives.some((a) => a !== null)) {
      const requeueable = free.filter((_, i) => actives[i] === null)
      await reQueue(queueKey, requeueable)
      return []
    }
    return free
  }

  await reQueue(queueKey, free)
  return []
}

async function tryCreateMatch(
  payload: Payload,
  queueKey: string,
  pair: Pair[],
  resolveProblem: () => Promise<{ id: string; timeLimitSeconds: number } | null>,
): Promise<void> {
  const free = await filterFreePlayers(payload, pair, queueKey)
  if (free.length !== 2) return

  try {
    const problem = await resolveProblem()
    if (!problem) {
      await reQueue(queueKey, free)
      console.warn('[matchmaker] no problems available; players re-queued')
      return
    }
    const match = await createMatchForPlayers(payload, {
      playerOneId: free[0].userId,
      playerTwoId: free[1].userId,
      problemId: problem.id,
      timeLimitSeconds: problem.timeLimitSeconds,
    })
    console.info(
      `[matchmaker] created match ${match.id}: ${free[0].userId} vs ${free[1].userId}, problem ${problem.id}`,
    )
  } catch (err) {
    console.error('[matchmaker] failed to create match, restoring queue', err)
    await reQueue(queueKey, free).catch(() => undefined)
  }
}

export async function runMatchmakerOnce(payload: Payload): Promise<void> {
  const redis = getRedis()

  // 1) Global queue — random problem.
  const globalPair = await popPairFrom(KEYS.queue)
  if (globalPair) {
    await tryCreateMatch(payload, KEYS.queue, globalPair, () => pickProblem(payload, globalPair.map((p) => p.userId)))
  }

  // 2) Per-problem queues — challenge the drawn problem.
  const problemIds = await activeProblemQueues()
  for (const problemId of problemIds) {
    const queueKey = KEYS.pqueue(problemId)
    const pair = await popPairFrom(queueKey)
    if (!pair) {
      await redis.srem(KEYS.pqueues, problemId).catch(() => undefined)
      continue
    }
    await tryCreateMatch(payload, queueKey, pair, async () => {
      const problem = await payload.findByID({
        collection: 'problems',
        id: problemId,
        depth: 0,
        overrideAccess: true,
      })
      return {
        id: String(problem.id),
        timeLimitSeconds: Number(problem.timeLimitSeconds) || 900,
      }
    })
    // Cleanup emptied problem queues so the set does not grow unbounded.
    if ((await redis.zcard(queueKey)) === 0) {
      await redis.srem(KEYS.pqueues, problemId).catch(() => undefined)
    }
  }
}
