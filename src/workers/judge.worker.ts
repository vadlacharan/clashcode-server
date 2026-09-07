import type { Job } from 'bullmq'
import type { Payload } from 'payload'
import { deriveSubmissionStatus, runAgainstTests, type TestInput } from '../lib/judge'
import {
  claimFinish,
  finalizeMatch,
  refId,
  type PlayerStats,
} from '../lib/matchState'
import {
  buildProgressPayload,
  type MatchDoc,
} from '../lib/matchService'
import { toStoredTestResults } from '../lib/sanitize'
import { emitMatch, emitUser } from '../lib/events'
import { harnessFromProblem } from '../lib/harness'
import type { JudgeJobData } from '../queues/judgeQueue'

export async function processJudgeJob(payload: Payload, job: Job<JudgeJobData>): Promise<void> {
  // Challenge expiry notifications ride the same queue as delayed jobs.
  if (job.name === 'challenge-expiry') {
    const { reapChallenge } = await import('../lib/challenges')
    await reapChallenge(String(job.data.challengeId))
    return
  }

  const { submissionId } = job.data
  if (!submissionId) return

  const submission = (await payload.findByID({
    collection: 'submissions',
    id: submissionId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> & {
    match: unknown
    author: unknown
    language: string
    code: string
    status: string
  }

  if (!submission || submission.status !== 'pending') return

  const matchId = refId(submission.match as never)
  const authorId = refId(submission.author as never)
  if (!matchId || !authorId) return

  const match = (await payload.findByID({
    collection: 'matches',
    id: matchId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as MatchDoc

  if (match.status !== 'active') {
    await payload.update({
      collection: 'submissions',
      id: submissionId,
      data: {
        status: 'judge_error',
        testResults: [{ index: 0, isPublic: false, passed: false, status: 'judge_error', timeMs: null }],
      },
      overrideAccess: true,
      depth: 0,
    })
    emitUser(authorId, 'submission:result', {
      submissionId: String(submissionId),
      status: 'judge_error',
      message: 'Match is no longer active',
    })
    return
  }

  await payload.update({
    collection: 'submissions',
    id: submissionId,
    data: { status: 'judging' },
    overrideAccess: true,
    depth: 0,
  })

  const problemId = refId(match.problem)
  if (!problemId) return

  const problem = (await payload.findByID({
    collection: 'problems',
    id: problemId,
    depth: 0,
    overrideAccess: true,
  })) as { difficulty: string; cpuTimeSeconds?: number }

  const { docs: tests } = await payload.find({
    collection: 'test-cases',
    where: { problem: { equals: problemId } },
    limit: 200,
    sort: 'order',
    depth: 0,
    overrideAccess: true,
  })

  const testInputs: TestInput[] = tests.map((t, i) => ({
    index: i,
    isPublic: Boolean((t as { isPublic?: boolean }).isPublic),
    input: (t as { input?: string }).input ?? '',
    expectedOutput: (t as { expectedOutput?: string }).expectedOutput ?? '',
  }))


  try {
    const outcomes = await runAgainstTests({
      code: submission.code,
      language: submission.language as never,
      tests: testInputs,
      cpuTimeSeconds: problem.cpuTimeSeconds ?? undefined,
      harness: harnessFromProblem(problem) ?? undefined,
    })

    const finalStatus = deriveSubmissionStatus(outcomes)
    const passedCount = outcomes.filter((o) => o.passed).length
    const storedResults = toStoredTestResults(outcomes)

    await payload.update({
      collection: 'submissions',
      id: submissionId,
      data: {
        status: finalStatus,
        testResults: storedResults,
        passedCount,
        totalCount: outcomes.length,
        judgedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      depth: 0,
    })

    emitUser(authorId, 'submission:result', {
      submissionId: String(submissionId),
      status: finalStatus,
      passedCount,
      totalCount: outcomes.length,
      tests: storedResults,
    })

    // Update live match stats for both players
    const side = refId(match.playerOne) === authorId ? 'playerOne' : 'playerTwo'
    const currentStats = (side === 'playerOne' ? match.playerOneStats : match.playerTwoStats) as
      | PlayerStats
      | null
      | undefined
    const nextStats: PlayerStats = {
      submissions: (Number(currentStats?.submissions) || 0) + 1,
      passed: passedCount,
      total: outcomes.length,
      lastStatus: finalStatus,
    }
    await payload.update({
      collection: 'matches',
      id: matchId,
      data: { [side === 'playerOne' ? 'playerOneStats' : 'playerTwoStats']: nextStats },
      overrideAccess: true,
      depth: 0,
    })

    if (match.mode === 'solo') {
      // Solo practice: no opponent, no Elo. On full acceptance the session
      // ends as 'solved'; the client is notified like a duel finish.
      if (finalStatus === 'accepted') {
        const claimed = await claimFinish(payload, matchId, { endReason: 'solved' })
        if (claimed) {
          const finishedPayload = {
            matchId: String(matchId),
            endReason: 'solved',
            draw: false,
            winnerId: null,
            mode: 'solo' as const,
            ratings: null,
          }
          emitUser(authorId, 'match:finished', finishedPayload)
        } else {
          console.warn(`[judge] solo match ${matchId} could not be claimed as solved`)
        }
      }
      return
    }

    const playerOneId = refId(match.playerOne)!
    const playerTwoId = refId(match.playerTwo)!
    const users = await Promise.all([
      payload.findByID({ collection: 'users', id: playerOneId, depth: 0, overrideAccess: true }),
      payload.findByID({ collection: 'users', id: playerTwoId, depth: 0, overrideAccess: true }),
    ])
    emitMatch(matchId, 'match:progress', buildProgressPayload(
      [
        { userId: playerOneId, username: (users[0] as { username?: string }).username ?? null, rating: Number(users[0].rating) || 0 },
        { userId: playerTwoId, username: (users[1] as { username?: string }).username ?? null, rating: Number(users[1].rating) || 0 },
      ],
      {
        playerOne: side === 'playerOne' ? nextStats : ((match.playerOneStats as PlayerStats) ?? { submissions: 0, passed: 0, total: 0, lastStatus: null }),
        playerTwo: side === 'playerTwo' ? nextStats : ((match.playerTwoStats as PlayerStats) ?? { submissions: 0, passed: 0, total: 0, lastStatus: null }),
      },
      playerOneId,
    ))

    if (finalStatus === 'accepted') {
      const claimed = await claimFinish(payload, matchId, {
        winnerId: authorId,
        endReason: 'solved',
      })
      if (claimed) {
        await finalizeMatch(payload, {
          matchId: String(matchId),
          playerOneId,
          playerTwoId,
          endReason: 'solved',
          winnerId: authorId,
          difficulty: (problem.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard' | 'insane',
        })
      } else {
        // The opponent already won the race — this submission was accepted
        // after the match finished, so it does not affect the result.
        console.info(`[judge] submission ${submissionId} accepted but match ${matchId} already finished`)
      }
    }
  } catch (err) {
    console.error(`[judge] failed to judge submission ${submissionId}`, err)
    throw err
  }
}
