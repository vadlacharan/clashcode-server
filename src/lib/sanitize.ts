import { MAX_STORED_STDOUT_LENGTH, type LanguageId } from './config'
import type { TestOutcome } from './judge'

function truncate(value: string | null): string | null {
  if (!value) return null
  return value.length > MAX_STORED_STDOUT_LENGTH ? value.slice(0, MAX_STORED_STDOUT_LENGTH) : value
}

export type PublicTestResult = {
  index: number
  isPublic: boolean
  passed: boolean
  status: TestOutcome['status']
  timeMs: number | null
  stdout?: string | null
  stderr?: string | null
  compileOutput?: string | null
}

/**
 * Rule set for what test details may leave the server:
 * - Public test cases are examples — their input/expected output are already
 *   shown to players, so their stdout/stderr may be included too.
 * - Hidden test cases NEVER expose input, expected output, actual stdout,
 *   stderr or compiler output — not to the author, not to the opponent.
 *   They only expose pass/fail + status + timing.
 * `includeHiddenDetails` is reserved for trusted/admin contexts only.
 */
export function sanitizeTestResults(
  outcomes: TestOutcome[],
  includeHiddenDetails = false,
): PublicTestResult[] {
  return outcomes.map((o) => {
    const base: PublicTestResult = {
      index: o.index,
      isPublic: o.isPublic,
      passed: o.passed,
      status: o.status,
      timeMs: o.timeMs,
    }
    if (o.isPublic || includeHiddenDetails) {
      return {
        ...base,
        stdout: truncate(o.stdout),
        stderr: truncate(o.stderr),
        compileOutput: truncate(o.compileOutput),
      }
    }
    return base
  })
}

/**
 * Results persisted to the database: details for public tests only, so hidden
 * outputs can never leak through any future read path.
 */
export function toStoredTestResults(outcomes: TestOutcome[]): PublicTestResult[] {
  return outcomes.map((o) => {
    const base: PublicTestResult = {
      index: o.index,
      isPublic: o.isPublic,
      passed: o.passed,
      status: o.status,
      timeMs: o.timeMs,
    }
    if (o.isPublic) {
      return { ...base, stdout: truncate(o.stdout), stderr: truncate(o.stderr) }
    }
    return { ...base, stdout: null, stderr: null, compileOutput: null }
  })
}

export type SubmissionView = {
  id: string | number
  language: LanguageId
  status: string
  passedCount: number
  totalCount: number
  createdAt: string | null
  judgedAt: string | null
  testResults: PublicTestResult[] | null
}

export function submissionViewFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submission: any,
  viewerIsAuthor: boolean,
): SubmissionView {
  void viewerIsAuthor
  const stored: PublicTestResult[] = Array.isArray(submission.testResults)
    ? submission.testResults
    : []
  return {
    id: String(submission.id),
    language: submission.language,
    status: submission.status,
    passedCount: Number(submission.passedCount) || 0,
    totalCount: Number(submission.totalCount) || 0,
    createdAt: submission.createdAt ?? null,
    judgedAt: submission.judgedAt ?? null,
    // Views omit hidden-test detail keys entirely (stored nulls are stripped).
    testResults: stored.map((r) =>
      r.isPublic
        ? r
        : {
            index: r.index,
            isPublic: r.isPublic,
            passed: r.passed,
            status: r.status,
            timeMs: r.timeMs,
          },
    ),
  }
}
