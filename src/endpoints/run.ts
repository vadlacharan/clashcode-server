import type { PayloadRequest } from 'payload'
import { KEYS, MAX_CODE_LENGTH, RUN_RATE_LIMIT, type LanguageId, LANGUAGE_IDS } from '../lib/config'
import { runAgainstTests, type TestInput } from '../lib/judge'
import { harnessFromProblem } from '../lib/harness'
import { participantSide, type MatchDoc } from '../lib/matchService'
import { sanitizeTestResults } from '../lib/sanitize'
import { rateLimit } from '../lib/rateLimit'
import { readJson, badRequest, forbidden, requireUser, serverError, tooMany, unauthorized } from './shared'

/**
 * POST /api/match/run
 * Body: { matchId, language, code }
 * Executes code against PUBLIC test cases only. Results are not stored and do
 * not affect the match — this is the "test my code" affordance.
 */
export async function runCode(req: PayloadRequest): Promise<Response> {
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

    const allowed = await rateLimit(KEYS.runLimit(user.id), RUN_RATE_LIMIT.max, RUN_RATE_LIMIT.windowSec)
    if (!allowed) return tooMany('Too many runs — wait a moment and try again')

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
    const problem = (await req.payload.findByID({
      collection: 'problems',
      id: problemId,
      depth: 0,
      overrideAccess: true,
    })) as { cpuTimeSeconds?: number }

    const { docs: publicTests } = await req.payload.find({
      collection: 'test-cases',
      where: { and: [{ problem: { equals: problemId } }, { isPublic: { equals: true } }] },
      limit: 50,
      sort: 'order',
      depth: 0,
      overrideAccess: true,
    })

    if (publicTests.length === 0) {
      return badRequest('This problem has no public test cases to run against')
    }

    const testInputs: TestInput[] = publicTests.map((t, i) => ({
      index: i,
      isPublic: true,
      input: (t as { input?: string }).input ?? '',
      expectedOutput: (t as { expectedOutput?: string }).expectedOutput ?? '',
    }))

    const outcomes = await runAgainstTests({
      code,
      language: language as LanguageId,
      tests: testInputs,
      cpuTimeSeconds: problem.cpuTimeSeconds ?? undefined,
      harness: harnessFromProblem(problem) ?? undefined,
    })

    return Response.json({ results: sanitizeTestResults(outcomes, true) })
  } catch (err) {
    console.error('[match/run]', err)
    return serverError('Could not execute code — the judge may be unavailable')
  }
}
