import {
  KEYS,
  PISTON_COMPILE_TIMEOUT_MS,
  PISTON_DEFAULT_CPU_SECONDS,
  PISTON_MAIN_FILE,
  PISTON_MEMORY_LIMIT_BYTES,
  REDIS_KEY_TTL,
  env,
  type LanguageId,
} from './config'
import { getRedis } from '../queues/connection'
import { runAgainstTestsLocal } from './localRunner'
import { wrapFunctionCode, type FunctionHarness } from './harness'

export type TestOutcomeStatus =
  | 'accepted'
  | 'wrong_answer'
  | 'timeout'
  | 'runtime_error'
  | 'compile_error'
  | 'judge_error'

export type TestInput = {
  index: number
  isPublic: boolean
  input: string
  expectedOutput: string
}

export type TestOutcome = {
  index: number
  isPublic: boolean
  passed: boolean
  status: TestOutcomeStatus
  timeMs: number | null
  stdout: string | null
  stderr: string | null
  compileOutput: string | null
  judgeStatusId: number | null
}

export class PistonError extends Error {}

type PistonRuntime = { language: string; version: string; aliases?: string[] }
type PistonStage = {
  stdout?: string
  stderr?: string
  output?: string
  code: number | null
  signal: string | null
  message?: string | null
  status?: string | null
  wall_time?: number
} | null
type PistonExecResponse = {
  language: string
  version: string
  compile?: PistonStage
  run?: PistonStage
  message?: string
}

export function normalizeOutput(value: string | null | undefined): string {
  if (!value) return ''
  let out = value.replace(/\r\n/g, '\n')
  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
  return out.replace(/\n+$/, '')
}

export function compareOutputs(actual: string | null, expected: string | null): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected)
}

/** Language names/aliases used to match Piston runtimes. */
const LANGUAGE_ALIASES: Record<LanguageId, string[]> = {
  python: ['python', 'python3', 'py'],
  javascript: ['javascript', 'js', 'node'],
  cpp: ['c++', 'cpp'],
  go: ['go', 'golang'],
}

export async function fetchPistonRuntimes(): Promise<PistonRuntime[]> {
  const res = await fetch(`${env.pistonUrl}/api/v2/runtimes`)
  if (!res.ok) {
    throw new PistonError(`Piston /runtimes failed with status ${res.status}`)
  }
  return (await res.json()) as PistonRuntime[]
}

/**
 * Resolves the installed Piston runtime (language + version) for a single
 * language. Only throws when the *requested* language is missing — other
 * runtimes may be installed later without breaking the rest.
 */
export async function resolveRuntime(language: LanguageId): Promise<PistonRuntime> {
  const redis = getRedis()
  const aliases = LANGUAGE_ALIASES[language]
  let partial: Partial<Record<LanguageId, PistonRuntime>> = {}
  try {
    const cached = await redis.get(KEYS.runtimesCache)
    if (cached) {
      partial = JSON.parse(cached) as Partial<Record<LanguageId, PistonRuntime>>
      const hit = partial[language]
      if (hit) return hit
    }
  } catch {
    // cache read failure is non-fatal
  }

  const runtimes = await fetchPistonRuntimes()
  const match = runtimes
    .filter((r) => aliases.includes(r.language) || r.aliases?.some((a) => aliases.includes(a)))
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))[0]
  if (!match) {
    throw new PistonError(
      `Piston is missing the "${language}" runtime. Install it with \`npm run piston:install-packages\`.`,
    )
  }

  partial[language] = { language: match.language, version: match.version }
  await redis
    .set(KEYS.runtimesCache, JSON.stringify(partial), 'EX', REDIS_KEY_TTL.runtimesCache)
    .catch(() => undefined)
  return partial[language]!
}

function stageFailed(stage: NonNullable<PistonStage>): boolean {
  return stage.code !== null && stage.code !== 0
}

function toOutcome(test: TestInput, resp: PistonExecResponse): TestOutcome {
  const base = {
    index: test.index,
    isPublic: test.isPublic,
  }

  if (resp.compile && (stageFailed(resp.compile) || resp.compile.status === 'TO')) {
    return {
      ...base,
      passed: false,
      status: 'compile_error',
      timeMs: null,
      stdout: null,
      stderr: resp.compile.stderr || resp.compile.output || resp.compile.message || null,
      compileOutput: resp.compile.output || null,
      judgeStatusId: null,
    }
  }

  const run = resp.run
  if (!run) {
    return {
      ...base,
      passed: false,
      status: 'judge_error',
      timeMs: null,
      stdout: null,
      stderr: resp.message ?? null,
      compileOutput: null,
      judgeStatusId: null,
    }
  }

  const status: TestOutcomeStatus = (() => {
    switch (run.status) {
      case 'TO':
        return 'timeout'
      case 'OL':
      case 'EL':
        return 'runtime_error'
      case 'RE':
      case 'SG':
        return 'runtime_error'
      case 'XX':
        return 'judge_error'
      default:
        break
    }
    if (run.signal && run.code === null) return 'timeout'
    if (run.code === null) return 'judge_error'
    if (run.code !== 0) return 'runtime_error'
    return compareOutputs(run.stdout ?? '', test.expectedOutput)
      ? 'accepted'
      : 'wrong_answer'
  })()

  // Surface the exit condition when the process failed without stderr.
  let stderr = run.stderr && run.stderr.length > 0 ? run.stderr : null
  if (!stderr && status !== 'accepted' && status !== 'wrong_answer') {
    if (status === 'timeout') stderr = `Process killed: exceeded the execution time limit`
    else if (run.message) stderr = run.message
    else if (run.code !== null) stderr = `Process exited with code ${run.code}`
    else if (run.signal) stderr = `Process killed by signal ${run.signal}`
  }

  return {
    ...base,
    passed: status === 'accepted',
    status,
    timeMs: typeof run.wall_time === 'number' ? Math.round(run.wall_time) : null,
    stdout: (run.stdout ?? '').length > 0 ? run.stdout! : null,
    stderr,
    compileOutput: resp.compile?.output || null,
    judgeStatusId: null,
  }
}

/**
 * Executes code against a list of tests. Dispatches to the configured judge
 * provider: 'piston' (sandboxed, production) or 'local' (dev convenience).
 * When a function-mode harness is given, the player's function-only code is
 * wrapped into a complete program that reads JSON args and prints the return.
 */
export async function runAgainstTests(opts: {
  code: string
  language: LanguageId
  tests: TestInput[]
  cpuTimeSeconds?: number
  harness?: FunctionHarness
}): Promise<TestOutcome[]> {
  const code =
    opts.harness != null
      ? wrapFunctionCode({ code: opts.code, language: opts.language, harness: opts.harness })
      : opts.code
  if (env.judgeProvider === 'local') {
    return runAgainstTestsLocal({ ...opts, code })
  }
  return runAgainstTestsPiston({ ...opts, code })
}

async function runAgainstTestsPiston(opts: {
  code: string
  language: LanguageId
  tests: TestInput[]
  cpuTimeSeconds?: number
}): Promise<TestOutcome[]> {
  const { code, language, tests } = opts
  const runTimeoutMs = Math.max(1, Math.round((opts.cpuTimeSeconds ?? PISTON_DEFAULT_CPU_SECONDS) * 1000))
  const runtime = await resolveRuntime(language)

  const outcomes: TestOutcome[] = []
  for (const test of tests) {
    const body = {
      language: runtime.language,
      version: runtime.version,
      files: [{ name: PISTON_MAIN_FILE[language], content: code }],
      stdin: test.input ?? '',
      compile_timeout: PISTON_COMPILE_TIMEOUT_MS,
      run_timeout: runTimeoutMs,
      run_memory_limit: PISTON_MEMORY_LIMIT_BYTES,
    }

    const res = await fetch(`${env.pistonUrl}/api/v2/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new PistonError(`Piston execute failed with status ${res.status}: ${text.slice(0, 500)}`)
    }
    outcomes.push(toOutcome(test, (await res.json()) as PistonExecResponse))
  }
  return outcomes
}

export function deriveSubmissionStatus(outcomes: TestOutcome[]): TestOutcomeStatus {
  if (outcomes.some((o) => o.status === 'compile_error')) return 'compile_error'
  if (outcomes.every((o) => o.status === 'accepted')) return 'accepted'
  if (outcomes.some((o) => o.status === 'runtime_error')) return 'runtime_error'
  if (outcomes.some((o) => o.status === 'timeout')) return 'timeout'
  if (outcomes.some((o) => o.status === 'judge_error')) return 'judge_error'
  return 'wrong_answer'
}
