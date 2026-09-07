import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PISTON_MAIN_FILE, type LanguageId } from './config'
import { compareOutputs, type TestInput, type TestOutcome, type TestOutcomeStatus } from './judge'

/**
 * Local judge provider — executes code directly on the host. This is a
 * development convenience for machines where the sandboxed Piston image
 * cannot run (e.g. Apple Silicon). It is NOT a security sandbox and must
 * never be used in production. Set JUDGE_PROVIDER=local to enable.
 */

const MAX_OUTPUT_BYTES = 64 * 1024
const COMPILE_TIMEOUT_MS = 15_000

type StageResult = {
  stdout: string
  stderr: string
  code: number | null
  signal: string | null
  timedOut: boolean
  outputTruncated: boolean
}

function runCommand(
  command: string,
  args: string[],
  opts: { cwd: string; stdin?: string; timeoutMs: number },
): Promise<StageResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    let outputTruncated = false
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, opts.timeoutMs)

    const cap = (current: string, chunk: string): string => {
      if (Buffer.byteLength(current, 'utf8') >= MAX_OUTPUT_BYTES) {
        outputTruncated = true
        return current
      }
      const next = current + chunk
      if (Buffer.byteLength(next, 'utf8') > MAX_OUTPUT_BYTES) {
        outputTruncated = true
        return next.slice(0, MAX_OUTPUT_BYTES)
      }
      return next
    }

    child.stdout.on('data', (d) => (stdout = cap(stdout, String(d))))
    child.stderr.on('data', (d) => (stderr = cap(stderr, String(d))))

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${err.message}`,
        code: null,
        signal: null,
        timedOut,
        outputTruncated,
      })
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code, signal, timedOut, outputTruncated })
    })

    if (opts.stdin !== undefined) {
      child.stdin.on('error', () => undefined)
      child.stdin.end(opts.stdin)
    } else {
      child.stdin.end()
    }
  })
}

const COMPILE_COMMANDS: Partial<Record<LanguageId, { command: string; args: string[]; output: string }>> = {
  cpp: { command: 'g++', args: ['-O2', '-std=c++17', 'main.cpp', '-o', 'program'], output: 'program' },
  go: { command: 'go', args: ['build', '-o', 'program', 'main.go'], output: 'program' },
}

const RUN_COMMANDS: Record<LanguageId, { command: string; args: string[] }> = {
  python: { command: 'python3', args: ['main.py'] },
  javascript: { command: 'node', args: ['main.js'] },
  cpp: { command: './program', args: [] },
  go: { command: './program', args: [] },
}

export async function runAgainstTestsLocal(opts: {
  code: string
  language: LanguageId
  tests: TestInput[]
  cpuTimeSeconds?: number
}): Promise<TestOutcome[]> {
  const { code, language, tests } = opts
  const runTimeoutMs = Math.max(1, Math.round((opts.cpuTimeSeconds ?? 5) * 1000))

  const outcomes: TestOutcome[] = []
  for (const test of tests) {
    const dir = await mkdtemp(path.join(tmpdir(), 'cc-judge-'))
    try {
      const mainFile = PISTON_MAIN_FILE[language]
      await writeFile(path.join(dir, mainFile), code, 'utf8')

      let compileOutput: string | null = null
      const compile = COMPILE_COMMANDS[language]
      if (compile) {
        const result = await runCommand(compile.command, compile.args, {
          cwd: dir,
          timeoutMs: COMPILE_TIMEOUT_MS,
        })
        if (result.timedOut || result.code !== 0) {
          outcomes.push({
            index: test.index,
            isPublic: test.isPublic,
            passed: false,
            status: 'compile_error',
            timeMs: null,
            stdout: null,
            stderr: result.stderr || null,
            compileOutput: result.stderr || result.stdout || null,
            judgeStatusId: null,
          })
          continue
        }
        compileOutput = null
      }

      const run = RUN_COMMANDS[language]
      const result = await runCommand(run.command, run.args, {
        cwd: dir,
        stdin: test.input ?? '',
        timeoutMs: runTimeoutMs,
      })

      let status: TestOutcomeStatus
      if (result.timedOut) {
        status = 'timeout'
      } else if (result.code === null && result.signal) {
        status = 'runtime_error'
      } else if (result.code !== 0) {
        status = 'runtime_error'
      } else if (result.outputTruncated) {
        status = 'runtime_error'
      } else {
        status = compareOutputs(result.stdout, test.expectedOutput) ? 'accepted' : 'wrong_answer'
      }

      // Always give the player something to look at: when the process failed
      // without writing to stderr, surface the exit condition itself.
      let stderr = result.stderr
      if (!stderr && status !== 'accepted' && status !== 'wrong_answer') {
        if (result.timedOut) {
          stderr = `Process killed: exceeded the ${runTimeoutMs}ms execution limit`
        } else if (result.code === null && result.signal) {
          stderr = `Process killed by signal ${result.signal}`
        } else if (result.code !== 0) {
          stderr = `Process exited with code ${result.code}`
        }
      }

      outcomes.push({
        index: test.index,
        isPublic: test.isPublic,
        passed: status === 'accepted',
        status,
        timeMs: null,
        stdout: result.stdout.length > 0 ? result.stdout : null,
        stderr: stderr && stderr.length > 0 ? stderr : null,
        compileOutput,
        judgeStatusId: null,
      })
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
  return outcomes
}
