import { Emitter } from '@socket.io/redis-emitter'
import { Redis } from 'ioredis'
import { env } from './config'

const globalForEvents = globalThis as typeof globalThis & {
  __ccSocketEmitter?: Emitter
}

export const matchRoom = (matchId: string | number) => `match:${matchId}`
export const userRoom = (userId: string | number) => `user:${userId}`

function getEmitter(): Emitter | null {
  try {
    if (!globalForEvents.__ccSocketEmitter) {
      const client = new Redis(env.redisUrl)
      globalForEvents.__ccSocketEmitter = new Emitter(client)
    }
    return globalForEvents.__ccSocketEmitter
  } catch (err) {
    console.error('[events] failed to create socket emitter', err)
    return null
  }
}

export function emitToRoom(room: string, event: string, data: unknown): void {
  const emitter = getEmitter()
  if (!emitter) return
  emitter.to(room).emit(event, data)
}

export const emitMatch = (matchId: string | number, event: string, data: unknown) =>
  emitToRoom(matchRoom(matchId), event, data)

export const emitUser = (userId: string | number, event: string, data: unknown) =>
  emitToRoom(userRoom(userId), event, data)
