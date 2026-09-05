import { createAdapter } from '@socket.io/redis-adapter'
import { jwtVerify } from 'jose'
import crypto from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { DISCONNECT_GRACE_MS, KEYS, env } from '../lib/config'
import { getRedis } from '../queues/connection'

// Payload signs auth JWTs with sha256(config.secret).slice(0, 32) — derive the
// same key so socket handshakes verify against the exact signing secret.
const jwtKey = crypto
  .createHash('sha256')
  .update(env.payloadSecret)
  .digest('hex')
  .slice(0, 32)

const matchRoom = (matchId: string) => `match:${matchId}`
const userRoom = (userId: string) => `user:${userId}`

const globalForIo = globalThis as typeof globalThis & {
  __ccSocketServer?: SocketIOServer
}

export function getSocketServer(): SocketIOServer | undefined {
  return globalForIo.__ccSocketServer
}

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  if (globalForIo.__ccSocketServer) return globalForIo.__ccSocketServer

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [env.frontendUrl, env.serverUrl],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  const pub = getRedis().duplicate()
  const sub = pub.duplicate()
  io.adapter(createAdapter(pub, sub))

  // --- Auth middleware: verify the Payload JWT (HS256, signed with secret) ---
  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers?.['authorization'] as string | undefined)?.replace(/^JWT /i, '')
      if (!token) return next(new Error('unauthorized'))

      const { payload: claims } = await jwtVerify(token, new TextEncoder().encode(jwtKey))
      const userId = claims.id as string | number | undefined
      const collection = claims.collection as string | undefined
      if (!userId || collection !== 'users') return next(new Error('unauthorized'))

      socket.data.userId = String(userId)
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string
    const redis = getRedis()
    const joinedMatches = new Set<string>()

    await socket.join(userRoom(userId))

    const joinMatchRoom = async (matchId: string): Promise<void> => {
      if (joinedMatches.has(matchId)) return
      joinedMatches.add(matchId)
      await socket.join(matchRoom(matchId))
      const key = KEYS.sock(matchId, userId)
      const count = await redis.incr(key)
      await redis.expire(key, 60 * 60 * 4)
      if (count === 1) {
        // First live connection for this user in this match → clear any
        // pending disconnect grace timer.
        const hadGrace = await redis.del(KEYS.dc(matchId, userId))
        if (hadGrace) {
          io.to(matchRoom(matchId)).emit('match:reconnected', { userId })
        }
      }
    }

    // Auto-resume: if the user is in an active match, drop them into the room.
    try {
      const activeMatchId = await redis.get(KEYS.inMatch(userId))
      if (activeMatchId) {
        await joinMatchRoom(activeMatchId)
        socket.emit('match:resume', { matchId: activeMatchId })
      }
    } catch (err) {
      console.error('[socket] resume check failed', err)
    }

    socket.on('match:join', async (data: { matchId?: string } | undefined) => {
      const matchId = data?.matchId ? String(data.matchId) : null
      if (!matchId) return
      const activeMatchId = await redis.get(KEYS.inMatch(userId)).catch(() => null)
      if (activeMatchId !== matchId) {
        socket.emit('match:join:error', { matchId, message: 'Not an active match for this user' })
        return
      }
      await joinMatchRoom(matchId)
    })

    socket.on('disconnect', async () => {
      for (const matchId of joinedMatches) {
        const key = KEYS.sock(matchId, userId)
        try {
          const count = await redis.decr(key)
          if (count <= 0) {
            await redis.del(key)
            // Last connection gone → start the grace timer. The sweeper
            // forfeits the match if the player has not returned when it fires.
            const expiry = Date.now() + DISCONNECT_GRACE_MS
            await redis.set(
              KEYS.dc(matchId, userId),
              String(expiry),
              'EX',
              Math.ceil(DISCONNECT_GRACE_MS / 1000) + 10,
            )
            io.to(matchRoom(matchId)).emit('match:disconnected', {
              userId,
              graceMs: DISCONNECT_GRACE_MS,
            })
          }
        } catch (err) {
          console.error('[socket] disconnect handling failed', err)
        }
      }
    })
  })

  globalForIo.__ccSocketServer = io
  return io
}
