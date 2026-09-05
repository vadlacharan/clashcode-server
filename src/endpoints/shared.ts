import type { PayloadRequest } from 'payload'

export function unauthorized(message = 'Unauthorized'): Response {
  return Response.json({ error: message }, { status: 401 })
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 })
}

export function forbidden(message = 'Forbidden'): Response {
  return Response.json({ error: message }, { status: 403 })
}

export function notFound(message = 'Not found'): Response {
  return Response.json({ error: message }, { status: 404 })
}

export function conflict(message: string): Response {
  return Response.json({ error: message }, { status: 409 })
}

export function tooMany(message = 'Too many requests, slow down'): Response {
  return Response.json({ error: message }, { status: 429 })
}

export function serverError(message = 'Internal server error'): Response {
  return Response.json({ error: message }, { status: 500 })
}

export function requireUser(req: PayloadRequest): { id: string } | null {
  if (!req.user) return null
  return { id: String(req.user.id) }
}

export async function readJson(req: PayloadRequest): Promise<Record<string, unknown>> {
  if (typeof req.json !== 'function') return {}
  try {
    const data = (await req.json()) as unknown
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
