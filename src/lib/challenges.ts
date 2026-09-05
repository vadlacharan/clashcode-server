import { CHALLENGE_TTL_SEC, KEYS } from './config'
import { emitUser } from './events'
import { getRedis } from '../queues/connection'

export type Challenge = {
  id: string
  fromId: string
  fromUsername: string
  fromRating: number
  toId: string
  toUsername: string
  problemId: string
  problemTitle: string
  problemDifficulty: string
  timeLimitSeconds: number
  createdAt: number
}

const serialize = (c: Challenge) => JSON.stringify(c)

export async function createChallenge(c: Challenge): Promise<void> {
  const redis = getRedis()
  const data = serialize(c)
  const multi = redis.multi()
  multi.set(KEYS.challenge(c.id), data, 'EX', CHALLENGE_TTL_SEC)
  multi.sadd(KEYS.challengesIn(c.toId), c.id)
  multi.sadd(KEYS.challengesOut(c.fromId), c.id)
  await multi.exec()
}

/** Atomically removes and returns the challenge, or null if it is gone/expired. */
export async function takeChallenge(id: string): Promise<Challenge | null> {
  const raw = await getRedis().getdel(KEYS.challenge(id))
  if (!raw) return null
  const challenge = JSON.parse(raw) as Challenge
  await Promise.all([
    getRedis().srem(KEYS.challengesIn(challenge.toId), id),
    getRedis().srem(KEYS.challengesOut(challenge.fromId), id),
  ]).catch(() => undefined)
  return challenge
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const raw = await getRedis().get(KEYS.challenge(id))
  return raw ? (JSON.parse(raw) as Challenge) : null
}

async function removeChallenge(id: string, fromId: string, toId: string): Promise<void> {
  await Promise.all([
    getRedis().del(KEYS.challenge(id)),
    getRedis().srem(KEYS.challengesIn(toId), id),
    getRedis().srem(KEYS.challengesOut(fromId), id),
  ]).catch(() => undefined)
}

export async function pendingChallengesFor(userId: string): Promise<{
  incoming: Challenge[]
  outgoing: Challenge[]
}> {
  const redis = getRedis()
  const [inIds, outIds] = await Promise.all([
    redis.smembers(KEYS.challengesIn(userId)),
    redis.smembers(KEYS.challengesOut(userId)),
  ])
  const load = async (ids: string[]) => {
    const challenges: Challenge[] = []
    for (const id of ids) {
      const c = await getChallenge(id)
      if (c) challenges.push(c)
      else await redis.srem(KEYS.challengesIn(userId), id).catch(() => undefined)
    }
    return challenges
  }
  return {
    incoming: await load(inIds),
    outgoing: await load(outIds),
  }
}

/** Cleans up a stale challenge set membership after the TTL already elapsed. */
export async function reapChallenge(id: string): Promise<Challenge | null> {
  const challenge = await getChallenge(id)
  if (!challenge) return null
  await removeChallenge(id, challenge.fromId, challenge.toId)
  emitUser(challenge.fromId, 'challenge:expired', { challengeId: id })
  emitUser(challenge.toId, 'challenge:removed', { challengeId: id })
  return challenge
}
