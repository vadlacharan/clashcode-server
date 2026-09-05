import { getRedis } from '../queues/connection'

/** Returns true when the action is allowed; false when rate limit exceeded. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const redis = getRedis()
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSec)
  }
  return count <= max
}

/** Ensures a minimum interval between actions. Returns false if called too soon. */
export async function enforceInterval(key: string, minIntervalSec: number): Promise<boolean> {
  const redis = getRedis()
  const result = await redis.set(key, '1', 'EX', minIntervalSec, 'NX')
  return result === 'OK'
}
