import type { Redis as RedisType } from 'ioredis'
import Redis from 'ioredis'
import { env } from '../lib/config'

const globalForRedis = globalThis as typeof globalThis & {
  __ccRedis?: RedisType
}

/** Shared, non-blocking redis connection (safe for commands; BullMQ workers use dedicated connections). */
export function getRedis(): RedisType {
  if (!globalForRedis.__ccRedis) {
    globalForRedis.__ccRedis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    })
  }
  return globalForRedis.__ccRedis
}

/** Creates a dedicated redis connection for BullMQ queues/workers. */
export function createBullConnection(): RedisType {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null })
}
