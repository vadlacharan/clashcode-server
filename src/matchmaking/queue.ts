import { KEYS } from '../lib/config'
import { getRedis } from '../queues/connection'

const POP_PAIR_LUA = `
local pair = redis.call('ZRANGE', KEYS[1], 0, 1, 'WITHSCORES')
if #pair < 4 then return nil end
redis.call('ZREM', KEYS[1], pair[1], pair[3])
return {pair[1], pair[2], pair[3], pair[4]}
`

/** Atomically pops the two oldest queued users from one queue, or returns null. */
export async function popPairFrom(
  queueKey: string,
): Promise<{ userId: string; joinedAt: number }[] | null> {
  const result = (await getRedis().eval(POP_PAIR_LUA, 1, queueKey)) as
    | [string, string, string, string]
    | null
  if (!result) return null
  return [
    { userId: result[0], joinedAt: Number(result[1]) },
    { userId: result[2], joinedAt: Number(result[3]) },
  ]
}

export async function joinQueue(userId: string, problemId?: string): Promise<boolean> {
  const redis = getRedis()
  const key = problemId ? KEYS.pqueue(problemId) : KEYS.queue
  const added = await redis.zadd(key, 'NX', String(Date.now()), userId)
  if (problemId && added === 1) {
    await redis.sadd(KEYS.pqueues, problemId)
  }
  return added === 1
}

export async function leaveQueue(userId: string, problemId?: string): Promise<void> {
  const redis = getRedis()
  const key = problemId ? KEYS.pqueue(problemId) : KEYS.queue
  await redis.zrem(key, userId)
  if (problemId) {
    const remaining = await redis.zcard(key)
    if (remaining === 0) {
      await redis.srem(KEYS.pqueues, problemId)
    }
  }
}

export async function reQueue(
  queueKey: string,
  users: { userId: string; joinedAt: number }[],
): Promise<void> {
  const redis = getRedis()
  if (users.length === 0) return
  await redis.zadd(
    queueKey,
    ...users.flatMap((u) => [String(u.joinedAt), u.userId]),
  )
}

export async function queueSize(problemId?: string): Promise<number> {
  const redis = getRedis()
  return problemId ? redis.zcard(KEYS.pqueue(problemId)) : redis.zcard(KEYS.queue)
}

/** All problem ids that currently have waiting players. */
export async function activeProblemQueues(): Promise<string[]> {
  return getRedis().smembers(KEYS.pqueues)
}
