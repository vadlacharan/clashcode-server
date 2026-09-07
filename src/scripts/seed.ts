import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import type { Problem } from '../payload-types'

type ParamType =
  | 'number'
  | 'number[]'
  | 'number[][]'
  | 'string'
  | 'string[]'
  | 'boolean'
  | 'boolean[]'

type ParamSpec = { name: string; type: ParamType }

type SeedProblem = {
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard' | 'insane'
  timeLimitSeconds: number
  cpuTimeSeconds: number
  tags: string[]
  statement: NonNullable<Problem['statement']>
  functionName: string
  params: ParamSpec[]
  returnType: ParamType
  testCases: { label: string; input: string; expectedOutput: string; isPublic: boolean; order: number }[]
}

// --- signature-driven starter templates ---------------------------------------

const PY_TYPES: Record<ParamType, string> = {
  number: 'int',
  'number[]': 'list[int]',
  'number[][]': 'list[list[int]]',
  string: 'str',
  'string[]': 'list[str]',
  boolean: 'bool',
  'boolean[]': 'list[bool]',
}

const GO_TYPES: Record<ParamType, string> = {
  number: 'float64',
  'number[]': '[]float64',
  'number[][]': '[][]float64',
  string: 'string',
  'string[]': '[]string',
  boolean: 'bool',
  'boolean[]': '[]bool',
}

const CPP_TYPES: Record<ParamType, string> = {
  number: 'long long',
  'number[]': 'vector<long long>',
  'number[][]': 'vector<vector<long long>>',
  string: 'string',
  'string[]': 'vector<string>',
  boolean: 'bool',
  'boolean[]': 'vector<bool>',
}

const CPP_STUB: Record<ParamType, string> = {
  number: 'return 0;',
  'number[]': 'return {};',
  'number[][]': 'return {};',
  string: 'return "";',
  'string[]': 'return {};',
  boolean: 'return false;',
  'boolean[]': 'return {};',
}

const GO_STUB: Record<ParamType, string> = {
  number: 'return 0',
  'number[]': 'return nil',
  'number[][]': 'return nil',
  string: 'return ""',
  'string[]': 'return nil',
  boolean: 'return false',
  'boolean[]': 'return nil',
}

function pySkeleton(fn: string, params: ParamSpec[]): string {
  const sig = params.map((p) => `${p.name}: ${PY_TYPES[p.type]}`).join(', ')
  return `def ${fn}(${sig}):
    # Write your code here
    pass
`
}

function jsSkeleton(fn: string, params: ParamSpec[]): string {
  const sig = params.map((p) => p.name).join(', ')
  return `function ${fn}(${sig}) {
  // Write your code here
}
`
}

function cppSkeleton(fn: string, params: ParamSpec[], returnType: ParamType): string {
  const sig = params.map((p) => `${CPP_TYPES[p.type]} ${p.name}`).join(', ')
  return `${CPP_TYPES[returnType]} ${fn}(${sig}) {
    // Write your code here
    ${CPP_STUB[returnType]}
}
`
}

function goSkeleton(fn: string, params: ParamSpec[], returnType: ParamType): string {
  const sig = params
    .map((p, i) => (i === 0 ? `${p.name} ${GO_TYPES[p.type]}` : `${p.name} ${GO_TYPES[p.type]}`))
    .join(', ')
  return `func ${fn}(${sig}) ${GO_TYPES[returnType]} {
	// Write your code here
	${GO_STUB[returnType]}
}
`
}

function templatesFor(fn: string, params: ParamSpec[], returnType: ParamType) {
  return [
    { language: 'python' as const, code: pySkeleton(fn, params) },
    { language: 'javascript' as const, code: jsSkeleton(fn, params) },
    { language: 'cpp' as const, code: cppSkeleton(fn, params, returnType) },
    { language: 'go' as const, code: goSkeleton(fn, params, returnType) },
  ]
}

// --- helpers -------------------------------------------------------------------

const richText = (text: string): NonNullable<Problem['statement']> => ({
  root: {
    type: 'root',
    children: text.split('\n\n').map((block) => ({
      type: 'paragraph',
      children: [
        { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: block, version: 1 },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 0,
      version: 1,
    })),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

/** Builds a test-case: one JSON line per argument, JSON return as expected. */
function argsTest(
  label: string,
  order: number,
  isPublic: boolean,
  args: unknown[],
  expected: unknown,
): { label: string; input: string; expectedOutput: string; isPublic: boolean; order: number } {
  return {
    label,
    input: args.map((a) => JSON.stringify(a)).join('\n') + '\n',
    expectedOutput: JSON.stringify(expected) + '\n',
    isPublic,
    order,
  }
}

const j = (v: unknown) => JSON.stringify(v)

// --- problems -------------------------------------------------------------------

const problems: SeedProblem[] = [
  {
    slug: 'sum-of-two-numbers',
    title: 'Sum of Two Numbers',
    difficulty: 'easy',
    timeLimitSeconds: 600,
    cpuTimeSeconds: 5,
    tags: ['math', 'warmup'],
    functionName: 'sumNumbers',
    params: [
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' },
    ],
    returnType: 'number',
    statement: richText(
      'Implement sumNumbers(a, b).\n\nIt receives two integers and must return their sum. Values may exceed the 32-bit integer range, so use 64-bit integers in C++.',
    ),
    testCases: [
      argsTest('Example 1', 0, true, [3, 4], 7),
      argsTest('Example 2', 1, true, [-5, 12], 7),
      argsTest('Hidden 1', 2, false, [0, 0], 0),
      argsTest('Hidden 2', 3, false, [-1000000, -1000000], -2000000),
      argsTest('Hidden 3', 4, false, [2147483647, 1], 2147483648),
      argsTest('Hidden 4', 5, false, [123456789, 987654321], 1111111110),
    ],
  },
  {
    slug: 'palindrome-check',
    title: 'Palindrome Check',
    difficulty: 'easy',
    timeLimitSeconds: 600,
    cpuTimeSeconds: 5,
    tags: ['strings'],
    functionName: 'isPalindrome',
    params: [{ name: 's', type: 'string' }],
    returnType: 'boolean',
    statement: richText(
      'Implement isPalindrome(s).\n\nIt receives a string of ASCII letters and digits (length 1 to 100000) and must return true if it reads the same forwards and backwards (case-sensitive), otherwise false.',
    ),
    testCases: [
      argsTest('Example 1', 0, true, ['racecar'], true),
      argsTest('Example 2', 1, true, ['hello'], false),
      argsTest('Hidden 1', 2, false, ['Abba'], false),
      argsTest('Hidden 2', 3, false, ['a'], true),
      argsTest('Hidden 3', 4, false, ['ab'], false),
      argsTest('Hidden 4', 5, false, ['01234567899876543210'], true),
      argsTest('Hidden 5', 6, false, ['amanaplanacanalpanama'], true),
      argsTest('Hidden 6 (long)', 7, false, [`${'x'.repeat(49999)}y${'x'.repeat(49999)}`], true),
    ],
  },
  {
    slug: 'max-subarray-sum',
    title: 'Max Subarray Sum',
    difficulty: 'medium',
    timeLimitSeconds: 900,
    cpuTimeSeconds: 5,
    tags: ['dynamic-programming', 'arrays'],
    functionName: 'maxSubArray',
    params: [{ name: 'nums', type: 'number[]' }],
    returnType: 'number',
    statement: richText(
      'Implement maxSubArray(nums).\n\nIt receives an array of up to 100000 integers (each between -1000000 and 1000000) and must return the maximum sum of a non-empty contiguous subarray. An O(n^2) scan will be too slow — think Kadane.',
    ),
    testCases: [
      argsTest('Example 1', 0, true, [[1, 2, 3, 4, 5]], 15),
      argsTest('Example 2', 1, true, [[-1, -2, -3, -4, -5]], -1),
      argsTest('Hidden 1', 2, false, [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], 6),
      argsTest('Hidden 2', 3, false, [[1000000]], 1000000),
      argsTest(
        'Hidden 3 (large)',
        4,
        false,
        [Array.from({ length: 100000 }, (_, i) => (i % 2 === 0 ? 1000000 : -1000000))],
        1000000,
      ),
      argsTest(
        'Hidden 4 (large)',
        5,
        false,
        [Array.from({ length: 100000 }, (_, i) => (i % 3 === 0 ? 500000 : -500000))],
        500000,
      ),
    ],
  },
  {
    slug: 'balanced-brackets',
    title: 'Balanced Brackets',
    difficulty: 'medium',
    timeLimitSeconds: 900,
    cpuTimeSeconds: 5,
    tags: ['stacks', 'strings'],
    functionName: 'isValid',
    params: [{ name: 's', type: 'string' }],
    returnType: 'boolean',
    statement: richText(
      'Implement isValid(s).\n\nIt receives a string of the characters ( ) [ ] { } (length 1 to 100000) and must return true if the bracket sequence is balanced (properly nested and closed in order), otherwise false.',
    ),
    testCases: [
      argsTest('Example 1', 0, true, ['()[]{}'], true),
      argsTest('Example 2', 1, true, ['([)]'], false),
      argsTest('Hidden 1', 2, false, ['((((()))))'], true),
      argsTest('Hidden 2', 3, false, [')'], false),
      argsTest('Hidden 3', 4, false, ['{[()]}'], true),
      argsTest('Hidden 4 (long)', 5, false, [`${'('.repeat(50000)}${')'.repeat(50000)}`], true),
      argsTest(
        'Hidden 5 (long)',
        6,
        false,
        [`${'('.repeat(49999)}${')'.repeat(49999)})`],
        false,
      ),
    ],
  },
  {
    slug: 'longest-increasing-subsequence',
    title: 'Longest Increasing Subsequence',
    difficulty: 'hard',
    timeLimitSeconds: 1200,
    cpuTimeSeconds: 5,
    tags: ['dynamic-programming', 'binary-search'],
    functionName: 'lengthOfLIS',
    params: [{ name: 'nums', type: 'number[]' }],
    returnType: 'number',
    statement: richText(
      'Implement lengthOfLIS(nums).\n\nIt receives an array of up to 100000 integers and must return the length of the longest strictly increasing subsequence (not necessarily contiguous). An O(n^2) solution will time out on the hidden tests — use the O(n log n) approach.',
    ),
    testCases: [
      argsTest('Example 1', 0, true, [[1, 2, 3, 4, 5]], 5),
      argsTest('Example 2', 1, true, [[5, 4, 3, 2, 1]], 1),
      argsTest('Hidden 1', 2, false, [[1, 3, 2, 4, 3, 5]], 4),
      argsTest(
        'Hidden 2 (large reversed)',
        3,
        false,
        [Array.from({ length: 100000 }, (_, i) => 100000 - i)],
        1,
      ),
      argsTest(
        'Hidden 3 (large ascending)',
        4,
        false,
        [Array.from({ length: 100000 }, (_, i) => i + 1)],
        100000,
      ),
      argsTest(
        'Hidden 4 (large pattern)',
        5,
        false,
        [Array.from({ length: 100000 }, (_, i) => (i * 7919) % 100000)],
        (() => {
          const tails: number[] = []
          for (let i = 0; i < 100000; i++) {
            const x = (i * 7919) % 100000
            let lo = 0
            let hi = tails.length
            while (lo < hi) {
              const mid = (lo + hi) >> 1
              if (tails[mid] < x) lo = mid + 1
              else hi = mid
            }
            if (lo === tails.length) tails.push(x)
            else tails[lo] = x
          }
          return tails.length
        })(),
      ),
    ],
  },
]

const users = [
  { username: 'admin', password: 'AdminPass123!', role: 'admin' },
  { username: 'alice', password: 'password123', role: 'user' },
  { username: 'bob', password: 'password123', role: 'user' },
]

void j

async function main(): Promise<void> {
  const payload = await getPayload({ config })

  for (const u of users) {
    const existing = await payload.find({
      collection: 'users',
      where: { username: { equals: u.username } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      await payload.update({
        collection: 'users',
        id: existing.docs[0].id,
        data: { password: u.password, role: u.role as 'admin' | 'user' },
        overrideAccess: true,
      })
      console.log(`user updated: ${u.username}`)
    } else {
      await payload.create({
        collection: 'users',
        data: { username: u.username, password: u.password, role: u.role as 'admin' | 'user' },
        overrideAccess: true,
      })
      console.log(`user created: ${u.username}`)
    }
  }

  for (const p of problems) {
    const existing = await payload.find({
      collection: 'problems',
      where: { slug: { equals: p.slug } },
      limit: 1,
      overrideAccess: true,
    })

    const problemData = {
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      judgeMode: 'function' as const,
      functionName: p.functionName,
      params: p.params,
      returnType: p.returnType,
      timeLimitSeconds: p.timeLimitSeconds,
      cpuTimeSeconds: p.cpuTimeSeconds,
      statement: p.statement,
      tags: p.tags.map((tag) => ({ tag })),
      starterTemplates: templatesFor(p.functionName, p.params, p.returnType),
    }

    let problemId: string | number
    if (existing.docs.length > 0) {
      await payload.update({
        collection: 'problems',
        id: existing.docs[0].id,
        data: problemData,
        overrideAccess: true,
      })
      problemId = existing.docs[0].id
      console.log(`problem updated: ${p.slug}`)
    } else {
      const created = await payload.create({
        collection: 'problems',
        data: problemData,
        overrideAccess: true,
      })
      problemId = created.id
      console.log(`problem created: ${p.slug}`)
    }

    // Existing tests belong to the old stdin/stdout format — replace them.
    const { docs: existingTests } = await payload.find({
      collection: 'test-cases',
      where: { problem: { equals: problemId } },
      limit: 200,
      overrideAccess: true,
    })
    for (const t of existingTests) {
      await payload.delete({ collection: 'test-cases', id: t.id, overrideAccess: true })
    }
    for (const tc of p.testCases) {
      await payload.create({
        collection: 'test-cases',
        data: { problem: problemId, ...tc },
        overrideAccess: true,
      })
    }
    console.log(`  -> ${p.testCases.length} function-mode test cases for ${p.slug}`)
  }

  console.log('seed complete')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed failed', err)
    process.exit(1)
  })
