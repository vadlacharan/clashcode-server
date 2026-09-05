import { describe, expect, it } from 'vitest'
import { compareOutputs, deriveSubmissionStatus, normalizeOutput } from '../../src/lib/judge'
import type { TestOutcome } from '../../src/lib/judge'

describe('output normalization', () => {
  it('treats trailing newlines as insignificant', () => {
    expect(normalizeOutput('7\n')).toBe(normalizeOutput('7'))
    expect(normalizeOutput('7\n\n\n')).toBe(normalizeOutput('7'))
  })

  it('strips trailing whitespace per line', () => {
    expect(normalizeOutput('hello   \nworld\t\n')).toBe('hello\nworld')
  })

  it('normalizes CRLF', () => {
    expect(normalizeOutput('a\r\nb\r\n')).toBe('a\nb')
  })

  it('preserves internal meaningful spacing', () => {
    expect(normalizeOutput('1  2 3\n')).toBe('1  2 3')
  })

  it('handles empty and null', () => {
    expect(normalizeOutput(null)).toBe('')
    expect(normalizeOutput('')).toBe('')
    expect(normalizeOutput('\n\n')).toBe('')
  })
})

describe('output comparison', () => {
  it('accepts equivalent outputs', () => {
    expect(compareOutputs('7\n', '7')).toBe(true)
    expect(compareOutputs('valid\r\n', 'valid')).toBe(true)
  })

  it('rejects different outputs', () => {
    expect(compareOutputs('7\n', '8\n')).toBe(false)
    expect(compareOutputs('hello world', 'hello  world')).toBe(false)
  })
})

describe('deriveSubmissionStatus', () => {
  const outcome = (status: TestOutcome['status']): TestOutcome => ({
    index: 0,
    isPublic: true,
    passed: status === 'accepted',
    status,
    timeMs: 1,
    stdout: null,
    stderr: null,
    compileOutput: null,
    judgeStatusId: null,
  })

  it('compile errors take precedence', () => {
    const outcomes = [outcome('accepted'), outcome('compile_error'), outcome('wrong_answer')]
    expect(deriveSubmissionStatus(outcomes)).toBe('compile_error')
  })

  it('accepted only when every test passes', () => {
    expect(deriveSubmissionStatus([outcome('accepted'), outcome('accepted')])).toBe('accepted')
    expect(deriveSubmissionStatus([outcome('accepted'), outcome('timeout')])).toBe('timeout')
    expect(deriveSubmissionStatus([outcome('accepted'), outcome('wrong_answer')])).toBe('wrong_answer')
  })
})
