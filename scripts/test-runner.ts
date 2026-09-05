import { runAgainstTestsLocal } from '../src/lib/localRunner'

const code = 'import sys\ndef main():\n    data = sys.stdin.read().split()\n    print(int(data[0]) + int(data[1]))\nmain()\n'
const tests = [
  { index: 0, isPublic: true, input: '3\n4\n', expectedOutput: '7\n' },
  { index: 1, isPublic: true, input: '-5\n12\n', expectedOutput: '7\n' },
]
const outcomes = await runAgainstTestsLocal({ code, language: 'python', tests, cpuTimeSeconds: 5 })
console.log(JSON.stringify(outcomes.map((o) => ({ index: o.index, passed: o.passed, stdout: o.stdout, status: o.status })), null, 1))
