import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import type { LanguageId } from '../lib/config'
import type { Problem } from '../payload-types'

type SeedProblem = {
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard' | 'insane'
  timeLimitSeconds: number
  cpuTimeSeconds: number
  constraints: string
  tags: string[]
  statement: NonNullable<Problem['statement']>
  testCases: { label: string; input: string; expectedOutput: string; isPublic: boolean; order: number }[]
  starterTemplates: { language: LanguageId; code: string }[]
}

const richText = (text: string): NonNullable<Problem['statement']> => ({
  root: {
    type: 'root',
    children: text
      .split('\n\n')
      .map((block) => ({
        type: 'paragraph',
        children: [{ type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: block, version: 1 }],
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

const py = (body: string) => body
const js = (body: string) => body
const cpp = (body: string) => body
const go = (body: string) => body

const sumTemplate = {
  python: py(
    `import sys

def main():
    data = sys.stdin.read().split()
    a, b = int(data[0]), int(data[1])
    print(a + b)

main()
`,
  ),
  javascript: js(
    `const fs = require('fs');
const data = fs.readFileSync(0, 'utf8').split(/\\s+/).map(Number);

function main() {
  console.log(data[0] + data[1]);
}

main();
`,
  ),
  cpp: cpp(
    `#include <bits/stdc++.h>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
`,
  ),
  go: go(
    `package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    var a, b int64
    fmt.Fscan(reader, &a, &b)
    fmt.Println(a + b)
}
`,
  ),
}

const problems: SeedProblem[] = [
  {
    slug: 'sum-of-two-numbers',
    title: 'Sum of Two Numbers',
    difficulty: 'easy',
    timeLimitSeconds: 600,
    cpuTimeSeconds: 5,
    constraints: 'Each number fits in a 32-bit signed integer. There are exactly two lines of input.',
    tags: ['math', 'warmup'],
    statement: richText(
      'You are given two integers, one per line.\n\nOutput their sum.',
    ),
    testCases: [
      { label: 'Example 1', input: '3\n4\n', expectedOutput: '7\n', isPublic: true, order: 0 },
      { label: 'Example 2', input: '-5\n12\n', expectedOutput: '7\n', isPublic: true, order: 1 },
      { label: 'Hidden 1', input: '0\n0\n', expectedOutput: '0\n', isPublic: false, order: 2 },
      { label: 'Hidden 2', input: '-1000000\n-1000000\n', expectedOutput: '-2000000\n', isPublic: false, order: 3 },
      { label: 'Hidden 3', input: '2147483647\n1\n', expectedOutput: '2147483648\n', isPublic: false, order: 4 },
      { label: 'Hidden 4', input: '123456789\n987654321\n', expectedOutput: '1111111110\n', isPublic: false, order: 5 },
    ],
    starterTemplates: [
      { language: 'python', code: sumTemplate.python },
      { language: 'javascript', code: sumTemplate.javascript },
      { language: 'cpp', code: sumTemplate.cpp },
      { language: 'go', code: sumTemplate.go },
    ],
  },
  {
    slug: 'palindrome-check',
    title: 'Palindrome Check',
    difficulty: 'easy',
    timeLimitSeconds: 600,
    cpuTimeSeconds: 5,
    constraints: 'The input is a single line with length 1 to 100000, consisting of ASCII letters and digits. Comparison is case-sensitive.',
    tags: ['strings'],
    statement: richText(
      'You are given a single line of text.\n\nOutput "yes" if the line reads the same forwards and backwards (case-sensitive), otherwise output "no".',
    ),
    testCases: [
      { label: 'Example 1', input: 'racecar\n', expectedOutput: 'yes\n', isPublic: true, order: 0 },
      { label: 'Example 2', input: 'hello\n', expectedOutput: 'no\n', isPublic: true, order: 1 },
      { label: 'Hidden 1', input: 'Abba\n', expectedOutput: 'no\n', isPublic: false, order: 2 },
      { label: 'Hidden 2', input: 'a\n', expectedOutput: 'yes\n', isPublic: false, order: 3 },
      { label: 'Hidden 3', input: 'ab\n', expectedOutput: 'no\n', isPublic: false, order: 4 },
      { label: 'Hidden 4', input: '01234567899876543210\n', expectedOutput: 'yes\n', isPublic: false, order: 5 },
      { label: 'Hidden 5', input: 'amanaplanacanalpanama\n', expectedOutput: 'yes\n', isPublic: false, order: 6 },
      {
        label: 'Hidden 6 (long)',
        input: `${'x'.repeat(49999)}y${'x'.repeat(49999)}\n`,
        expectedOutput: 'yes\n',
        isPublic: false,
        order: 7,
      },
    ],
    starterTemplates: [
      {
        language: 'python',
        code: py(`import sys

def main():
    s = sys.stdin.readline().strip()
    print("yes" if s == s[::-1] else "no")

main()
`),
      },
      {
        language: 'javascript',
        code: js(`const fs = require('fs');

function main() {
  const s = fs.readFileSync(0, 'utf8').trim();
  console.log(s === s.split('').reverse().join('') ? 'yes' : 'no');
}

main();
`),
      },
      {
        language: 'cpp',
        code: cpp(`#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    getline(cin, s);
    string r(s.rbegin(), s.rend());
    cout << (s == r ? "yes" : "no") << endl;
    return 0;
}
`),
      },
      {
        language: 'go',
        code: go(`package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    s, _ := reader.ReadString('\\n')
    for len(s) > 0 && (s[len(s)-1] == '\\n' || s[len(s)-1] == '\\r') {
        s = s[:len(s)-1]
    }
    i, j := 0, len(s)-1
    for i < j {
        if s[i] != s[j] {
            fmt.Println("no")
            return
        }
        i++
        j--
    }
    fmt.Println("yes")
}
`),
      },
    ],
  },
  {
    slug: 'max-subarray-sum',
    title: 'Max Subarray Sum',
    difficulty: 'medium',
    timeLimitSeconds: 900,
    cpuTimeSeconds: 5,
    constraints: '1 <= n <= 100000. Each element is between -1000000 and 1000000. The subarray must contain at least one element.',
    tags: ['dynamic-programming', 'arrays'],
    statement: richText(
      'You are given an array of n integers.\n\nFind the maximum possible sum of a contiguous subarray (containing at least one element) and output it.',
    ),
    testCases: [
      { label: 'Example 1', input: '5\n1 2 3 4 5\n', expectedOutput: '15\n', isPublic: true, order: 0 },
      { label: 'Example 2', input: '5\n-1 -2 -3 -4 -5\n', expectedOutput: '-1\n', isPublic: true, order: 1 },
      { label: 'Hidden 1', input: '1\n1000000\n', expectedOutput: '1000000\n', isPublic: false, order: 2 },
      { label: 'Hidden 2', input: '9\n-2 1 -3 4 -1 2 1 -5 4\n', expectedOutput: '6\n', isPublic: false, order: 3 },
      {
        label: 'Hidden 3 (large)',
        input: `100000\n${Array.from({ length: 100000 }, (_, i) => (i % 2 === 0 ? 1000000 : -1000000)).join(' ')}\n`,
        expectedOutput: '1000000\n',
        isPublic: false,
        order: 4,
      },
      {
        label: 'Hidden 4 (large)',
        input: `100000\n${Array.from({ length: 100000 }, (_, i) => (i % 3 === 0 ? 500000 : -500000)).join(' ')}\n`,
        expectedOutput: '500000\n',
        isPublic: false,
        order: 5,
      },
    ],
    starterTemplates: [
      {
        language: 'python',
        code: py(`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    arr = list(map(int, data[1:1 + n]))
    best = arr[0]
    current = arr[0]
    for x in arr[1:]:
        current = max(x, current + x)
        best = max(best, current)
    print(best)

main()
`),
      },
      {
        language: 'javascript',
        code: js(`const fs = require('fs');

function main() {
  const data = fs.readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean).map(Number);
  const n = data[0];
  let best = data[1];
  let current = data[1];
  for (let i = 2; i <= n; i++) {
    current = Math.max(data[i], current + data[i]);
    best = Math.max(best, current);
  }
  console.log(best);
}

main();
`),
      },
      {
        language: 'cpp',
        code: cpp(`#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    scanf("%d", &n);
    long long best = LLONG_MIN, current = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        scanf("%lld", &x);
        current = max(x, current + x);
        best = max(best, current);
    }
    printf("%lld\\n", best);
    return 0;
}
`),
      },
      {
        language: 'go',
        code: go(`package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    var n int
    fmt.Fscan(reader, &n)
    best := int64(-9_000_000_000_000_000_000)
    current := int64(0)
    for i := 0; i < n; i++ {
        var x int64
        fmt.Fscan(reader, &x)
        if i == 0 || current < 0 {
            current = x
        } else {
            current += x
        }
        if current > best {
            best = current
        }
    }
    fmt.Println(best)
}
`),
      },
    ],
  },
  {
    slug: 'balanced-brackets',
    title: 'Balanced Brackets',
    difficulty: 'medium',
    timeLimitSeconds: 900,
    cpuTimeSeconds: 5,
    constraints: 'The input is a single line with length 1 to 100000, consisting only of the characters ()[]{}.',
    tags: ['stacks', 'strings'],
    statement: richText(
      'You are given a single line consisting of the characters ( ) [ ] { }.\n\nOutput "valid" if the bracket sequence is balanced (every bracket is closed in the correct order and brackets are properly nested), otherwise output "invalid".',
    ),
    testCases: [
      { label: 'Example 1', input: '()[]{}\n', expectedOutput: 'valid\n', isPublic: true, order: 0 },
      { label: 'Example 2', input: '([)]\n', expectedOutput: 'invalid\n', isPublic: true, order: 1 },
      { label: 'Hidden 1', input: '((((()))))\n', expectedOutput: 'valid\n', isPublic: false, order: 2 },
      { label: 'Hidden 2', input: ')\n', expectedOutput: 'invalid\n', isPublic: false, order: 3 },
      { label: 'Hidden 3', input: '{[()]}\n', expectedOutput: 'valid\n', isPublic: false, order: 4 },
      {
        label: 'Hidden 4 (long)',
        input: `${'('.repeat(50000)}${')'.repeat(50000)}\n`,
        expectedOutput: 'valid\n',
        isPublic: false,
        order: 5,
      },
      {
        label: 'Hidden 5 (long)',
        input: `${'('.repeat(49999)}${')'.repeat(49999)})\n`,
        expectedOutput: 'invalid\n',
        isPublic: false,
        order: 6,
      },
    ],
    starterTemplates: [
      {
        language: 'python',
        code: py(`import sys

def main():
    s = sys.stdin.readline().strip()
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        else:
            if not stack or stack.pop() != pairs[ch]:
                print("invalid")
                return
    print("valid" if not stack else "invalid")

main()
`),
      },
      {
        language: 'javascript',
        code: js(`const fs = require('fs');

function main() {
  const s = fs.readFileSync(0, 'utf8').trim();
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else {
      if (stack.pop() !== pairs[ch]) {
        console.log('invalid');
        return;
      }
    }
  }
  console.log(stack.length === 0 ? 'valid' : 'invalid');
}

main();
`),
      },
      {
        language: 'cpp',
        code: cpp(`#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    getline(cin, s);
    unordered_map<char, char> pairs = {{')', '('}, {']', '['}, {'}', '{'}};
    stack<char> st;
    for (char ch : s) {
        if (ch == '(' || ch == '[' || ch == '{') {
            st.push(ch);
        } else {
            if (st.empty() || st.top() != pairs[ch]) {
                cout << "invalid" << endl;
                return 0;
            }
            st.pop();
        }
    }
    cout << (st.empty() ? "valid" : "invalid") << endl;
    return 0;
}
`),
      },
      {
        language: 'go',
        code: go(`package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    s, _ := reader.ReadString('\\n')
    for len(s) > 0 && (s[len(s)-1] == '\\n' || s[len(s)-1] == '\\r') {
        s = s[:len(s)-1]
    }
    pairs := map[byte]byte{')': '(', ']': '[', '}': '{'}
    stack := make([]byte, 0, len(s))
    for i := 0; i < len(s); i++ {
        ch := s[i]
        if ch == '(' || ch == '[' || ch == '{' {
            stack = append(stack, ch)
        } else {
            if len(stack) == 0 || stack[len(stack)-1] != pairs[ch] {
                fmt.Println("invalid")
                return
            }
            stack = stack[:len(stack)-1]
        }
    }
    if len(stack) == 0 {
        fmt.Println("valid")
    } else {
        fmt.Println("invalid")
    }
}
`),
      },
    ],
  },
  {
    slug: 'longest-increasing-subsequence',
    title: 'Longest Increasing Subsequence',
    difficulty: 'hard',
    timeLimitSeconds: 1200,
    cpuTimeSeconds: 5,
    constraints: '1 <= n <= 100000. Each element is between -1000000 and 1000000. The subsequence does not need to be contiguous.',
    tags: ['dynamic-programming', 'binary-search'],
    statement: richText(
      'You are given an array of n integers.\n\nOutput the length of the longest strictly increasing subsequence. An O(n^2) solution will be too slow for the hidden tests — use the O(n log n) approach.',
    ),
    testCases: [
      { label: 'Example 1', input: '5\n1 2 3 4 5\n', expectedOutput: '5\n', isPublic: true, order: 0 },
      { label: 'Example 2', input: '5\n5 4 3 2 1\n', expectedOutput: '1\n', isPublic: true, order: 1 },
      { label: 'Hidden 1', input: '6\n1 3 2 4 3 5\n', expectedOutput: '4\n', isPublic: false, order: 2 },
      {
        label: 'Hidden 2 (large reversed)',
        input: `100000\n${Array.from({ length: 100000 }, (_, i) => 100000 - i).join(' ')}\n`,
        expectedOutput: '1\n',
        isPublic: false,
        order: 3,
      },
      {
        label: 'Hidden 3 (large)',
        input: `100000\n${Array.from({ length: 100000 }, (_, i) => i + 1).join(' ')}\n`,
        expectedOutput: '100000\n',
        isPublic: false,
        order: 4,
      },
      {
        label: 'Hidden 4 (large random-ish)',
        input: `100000\n${Array.from({ length: 100000 }, (_, i) => ((i * 7919) % 100000)).join(' ')}\n`,
        expectedOutput: `${(() => {
          // Compute expected LIS length for the generated sequence offline.
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
        })()}\n`,
        isPublic: false,
        order: 5,
      },
    ],
    starterTemplates: [
      {
        language: 'python',
        code: py(`import sys
import bisect

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    tails = []
    for i in range(1, n + 1):
        x = int(data[i])
        pos = bisect.bisect_left(tails, x)
        if pos == len(tails):
            tails.append(x)
        else:
            tails[pos] = x
    print(len(tails))

main()
`),
      },
      {
        language: 'javascript',
        code: js(`const fs = require('fs');

function main() {
  const data = fs.readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean).map(Number);
  const n = data[0];
  const tails = [];
  for (let i = 1; i <= n; i++) {
    const x = data[i];
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    if (lo === tails.length) tails.push(x);
    else tails[lo] = x;
  }
  console.log(tails.length);
}

main();
`),
      },
      {
        language: 'cpp',
        code: cpp(`#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    scanf("%d", &n);
    vector<int> tails;
    for (int i = 0; i < n; i++) {
        int x;
        scanf("%d", &x);
        auto it = lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else *it = x;
    }
    printf("%d\\n", (int)tails.size());
    return 0;
}
`),
      },
      {
        language: 'go',
        code: go(`package main

import (
    "bufio"
    "fmt"
    "os"
    "sort"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    var n int
    fmt.Fscan(reader, &n)
    tails := make([]int, 0, n)
    for i := 0; i < n; i++ {
        var x int
        fmt.Fscan(reader, &x)
        pos := sort.SearchInts(tails, x)
        if pos == len(tails) {
            tails = append(tails, x)
        } else {
            tails[pos] = x
        }
    }
    fmt.Println(len(tails))
}
`),
      },
    ],
  },
]

const users = [
  { username: 'admin', password: 'AdminPass123!', role: 'admin' },
  { username: 'alice', password: 'password123', role: 'user' },
  { username: 'bob', password: 'password123', role: 'user' },
]

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
        user: existing.docs[0],
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
      timeLimitSeconds: p.timeLimitSeconds,
      cpuTimeSeconds: p.cpuTimeSeconds,
      statement: p.statement,
      constraints: p.constraints,
      tags: p.tags.map((tag) => ({ tag })),
      starterTemplates: p.starterTemplates,
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

    const { docs: existingTests } = await payload.find({
      collection: 'test-cases',
      where: { problem: { equals: problemId } },
      limit: 200,
      overrideAccess: true,
    })
    const existingByLabel = new Map(existingTests.map((t) => [t.label ?? '', t.id]))

    for (const tc of p.testCases) {
      if (existingByLabel.has(tc.label)) {
        await payload.update({
          collection: 'test-cases',
          id: existingByLabel.get(tc.label)!,
          data: {
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isPublic: tc.isPublic,
            order: tc.order,
          },
          overrideAccess: true,
        })
      } else {
        await payload.create({
          collection: 'test-cases',
          data: { problem: problemId, ...tc },
          overrideAccess: true,
        })
      }
    }
    console.log(`  -> ${p.testCases.length} test cases ensured for ${p.slug}`)
  }

  console.log('seed complete')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed failed', err)
    process.exit(1)
  })
