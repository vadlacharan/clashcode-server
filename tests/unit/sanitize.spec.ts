import { describe, expect, it } from 'vitest'
import { sanitizeTestResults, submissionViewFor, toStoredTestResults } from '../../src/lib/sanitize'
import type { TestOutcome } from '../../src/lib/judge'

const makeOutcome = (overrides: Partial<TestOutcome>): TestOutcome => ({
  index: 0,
  isPublic: false,
  passed: false,
  status: 'wrong_answer',
  timeMs: 12,
  stdout: 'secret-stdout',
  stderr: 'secret-stderr',
  compileOutput: null,
  judgeStatusId: 4,
  ...overrides,
})

describe('sanitizeTestResults', () => {
  it('hides stdout/stderr of hidden tests from opponents', () => {
    const outcomes = [makeOutcome({ index: 0, isPublic: false })]
    const view = sanitizeTestResults(outcomes, false)
    expect(view[0]).not.toHaveProperty('stdout')
    expect(view[0]).not.toHaveProperty('stderr')
    expect(view[0]).not.toHaveProperty('compileOutput')
    expect(view[0].passed).toBe(false)
    expect(view[0].status).toBe('wrong_answer')
  })

  it('public tests always carry details (they are examples)', () => {
    const outcomes = [makeOutcome({ index: 0, isPublic: true })]
    const forOpponent = sanitizeTestResults(outcomes, false)
    expect(forOpponent[0].stdout).toBe('secret-stdout')
    expect(forOpponent[0].stderr).toBe('secret-stderr')
  })

  it('hidden details appear only in trusted contexts', () => {
    const outcomes = [makeOutcome({ index: 0, isPublic: false })]
    const trusted = sanitizeTestResults(outcomes, true)
    expect(trusted[0].stdout).toBe('secret-stdout')
  })
})

describe('stored test results', () => {
  it('only persists stdout/stderr for public tests', () => {
    const outcomes = [
      makeOutcome({ index: 0, isPublic: true, passed: true, status: 'accepted' }),
      makeOutcome({ index: 1, isPublic: false, passed: true, status: 'accepted' }),
    ]
    const stored = toStoredTestResults(outcomes)
    expect(stored[0].stdout).toBe('secret-stdout')
    expect(stored[1].stdout).toBeNull()
    expect(stored[1].stderr).toBeNull()
    expect(stored[1].passed).toBe(true)
  })
})

describe('submissionViewFor', () => {
  it('never exposes hidden-test payloads to non-authors', () => {
    const outcomes = [makeOutcome({ index: 0, isPublic: false })]
    const submission = {
      id: 1,
      language: 'python',
      status: 'wrong_answer',
      passedCount: 0,
      totalCount: 1,
      createdAt: null,
      judgedAt: null,
      testResults: toStoredTestResults(outcomes),
    }
    const view = submissionViewFor(submission, false)
    expect(view.testResults?.[0]).not.toHaveProperty('stdout')
    expect(view.testResults?.[0]).not.toHaveProperty('stderr')
    expect(view.testResults?.[0].passed).toBe(false)
  })

  it('shows public test output in submission views', () => {
    const outcomes = [makeOutcome({ index: 0, isPublic: true, passed: true, status: 'accepted' })]
    const submission = {
      id: 1,
      language: 'python',
      status: 'accepted',
      passedCount: 1,
      totalCount: 1,
      createdAt: null,
      judgedAt: null,
      testResults: toStoredTestResults(outcomes),
    }
    const view = submissionViewFor(submission, true)
    expect(view.testResults?.[0].stdout).toBe('secret-stdout')
  })
})
