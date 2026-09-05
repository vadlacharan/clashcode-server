import type { PayloadRequest } from 'payload'
import {
  KEYS,
  MAX_CODE_LENGTH,
  REDIS_KEY_TTL,
  SUBMIT_MAX_PER_MATCH,
  SUBMIT_MIN_INTERVAL_SEC,
  type LanguageId,
  LANGUAGE_IDS,
} from '../lib/config'
import { participantSide, type MatchDoc } from '../lib/matchService'
import { enforceInterval, rateLimit } from '../lib/rateLimit'
import { enqueueJudgeJob } from '../queues/judgeQueue'
import { readJson, badRequest, conflict, forbidden, requireUser, serverError, tooMany, unauthorized } from './shared'

/**
 * POST /api/match/submit
 * Body: { matchId, language, code }
 * Creates a pending submission against ALL tests (public + hidden) and enqueues
 * the judge job. Winner determination happens in the worker, atomically.
 */
export async function submitSolution(req: PayloadRequest): Promise<Response> {
  const user = requireUser(req)
  if (!user) return unauthorized()

  try {
    const body = await readJson(req)
    const matchId = body.matchId ? String(body.matchId) : null
    const language = body.language ? String(body.language) : null
    const code = body.code ? String(body.code) : ''

    if (!matchId) return badRequest('matchId is required')
    if (!language || !LANGUAGE_IDS.includes(language as LanguageId)) {
      return badRequest('Unsupported language')
    }
    if (!code.trim()) return badRequest('Code is required')
    if (code.length > MAX_CODE_LENGTH) {
      return badRequest(`Code exceeds the maximum length of ${MAX_CODE_LENGTH} characters`)
    }

    // Rate limits: min interval + per-match cap.
    const spaced = await enforceInterval(KEYS.submitInterval(user.id), SUBMIT_MIN_INTERVAL_SEC)
    if (!spaced) {
      return tooMany(`Please wait ${SUBMIT_MIN_INTERVAL_SEC}s between submissions`)
    }
    const withinCap = await rateLimit(
      KEYS.submitCount(matchId, user.id),
      SUBMIT_MAX_PER_MATCH,
      REDIS_KEY_TTL.submitCount,
    )
    if (!withinCap) {
      return tooMany('Submission limit for this match reached')
    }

    let match: MatchDoc
    try {
      match = (await req.payload.findByID({
        collection: 'matches',
        id: matchId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as MatchDoc
    } catch {
      return badRequest('Match not found')
    }

    if (match.status !== 'active') return forbidden('Match is not active')
    if (!participantSide(match, user.id)) return forbidden('You are not a participant in this match')

    const problemId = typeof match.problem === 'object' ? match.problem.id : match.problem
    const { totalDocs: totalTests } = await req.payload.count({
      collection: 'test-cases',
      where: { problem: { equals: problemId } },
      overrideAccess: true,
    })
    if (totalTests === 0) {
      return conflict('This problem has no test cases configured')
    }

    const submission = await req.payload.create({
      collection: 'submissions',
      data: {
        match: Number(matchId),
        author: Number(user.id),
        language: language as LanguageId,
        code,
        status: 'pending',
        totalCount: totalTests,
      },
      overrideAccess: true,
      depth: 0,
    })

    await enqueueJudgeJob({
      submissionId: String(submission.id),
      matchId: String(matchId),
      authorId: user.id,
    })

    return Response.json({ submissionId: String(submission.id), status: 'pending' })
  } catch (err) {
    console.error('[match/submit]', err)
    return serverError('Could not submit solution')
  }
}
