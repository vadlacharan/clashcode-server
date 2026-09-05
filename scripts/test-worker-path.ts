import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { runAgainstTestsLocal } from '../src/lib/localRunner'

async function main() {
  const payload = await getPayload({ config })
  const match = await payload.findByID({ collection: 'matches', id: 3, depth: 0, overrideAccess: true })
  const problemId = typeof match.problem === 'object' ? match.problem.id : match.problem
  const { docs: tests } = await payload.find({
    collection: 'test-cases',
    where: { problem: { equals: problemId } },
    limit: 200,
    sort: 'order',
    depth: 0,
    overrideAccess: true,
  })
  console.log('found', tests.length, 'tests; first two inputs:')
  for (const t of tests.slice(0, 2)) {
    console.log(JSON.stringify({ input: t.input, expected: t.expectedOutput, isPublic: t.isPublic }))
  }
  const testInputs = tests.map((t, i) => ({
    index: i,
    isPublic: Boolean((t as { isPublic?: boolean }).isPublic),
    input: (t as { input?: string }).input ?? '',
    expectedOutput: (t as { expectedOutput?: string }).expectedOutput ?? '',
  }))
  const code = 'import sys\ndef main():\n    data = sys.stdin.read().split()\n    print(int(data[0]) + int(data[1]))\nmain()\n'
  const outcomes = await runAgainstTestsLocal({ code, language: 'python', tests: testInputs, cpuTimeSeconds: 5 })
  console.log(outcomes.map((o) => ({ i: o.index, passed: o.passed, stdout: o.stdout })))
  process.exit(0)
}
main()
