import type { LanguageId } from './config'

/**
 * Function-mode harness generation. Players submit ONLY a function body +
 * signature. At judge time the code is wrapped with a generated main that:
 *   1. reads one JSON-encoded argument per line from stdin
 *   2. calls the player's function with the parsed args
 *   3. prints the JSON-serialized return value
 * The serialized output is compared against the test's `expectedOutput`.
 *
 * Supported parameter types (TYPE_VOCAB): number, number[], number[][],
 * string, string[], boolean, boolean[]. In C++/Go `number` maps to a 64-bit
 * integer (C++ long long / Go float64 via encoding/json).
 */

export type ParamSpec = { name: string; type: string }

export type FunctionHarness = {
  functionName: string
  params: ParamSpec[]
  returnType: string
}

// --- C++ ---------------------------------------------------------------------

const CPP_TYPE_MAP: Record<string, string> = {
  number: 'long long',
  'number[]': 'vector<long long>',
  'number[][]': 'vector<vector<long long>>',
  string: 'string',
  'string[]': 'vector<string>',
  boolean: 'bool',
  'boolean[]': 'vector<bool>',
}

const CPP_PRELUDE = String.raw`#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <cmath>
#include <cctype>
#include <cstdlib>
using namespace std;

// ---- embedded mini JSON (parse + serialize) ---------------------------------
struct Jv {
    int t; // 0 num, 1 str, 2 bool, 3 arr, 4 null
    double num; string str; bool b; vector<Jv> arr;
    Jv() : t(4), num(0), b(false) {}
};
struct Jp {
    const char* p; const char* e;
    Jp(const string& s) : p(s.data()), e(s.data() + s.size()) {}
    void skip() { while (p < e && (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n')) ++p; }
    Jv parse() {
        skip();
        Jv v;
        if (p >= e) return v;
        char c = *p;
        if (c == '[') {
            v.t = 3; ++p; skip();
            if (p < e && *p == ']') { ++p; return v; }
            while (p < e) {
                v.arr.push_back(parse());
                skip();
                if (p < e && *p == ',') { ++p; continue; }
                if (p < e && *p == ']') { ++p; break; }
                break;
            }
        } else if (c == '"') {
            v.t = 1; ++p;
            while (p < e && *p != '"') {
                if (*p == '\\' && p + 1 < e) {
                    ++p;
                    char x = *p;
                    if (x == 'n') v.str += '\n';
                    else if (x == 't') v.str += '\t';
                    else if (x == 'r') v.str += '\r';
                    else v.str += x;
                } else v.str += *p;
                ++p;
            }
            if (p < e) ++p; // closing quote
        } else if (c == 't') { v.t = 2; v.b = true; p += 4; }
        else if (c == 'f') { v.t = 2; v.b = false; p += 5; }
        else { // number
            v.t = 0;
            char* endp = nullptr;
            v.num = strtod(p, &endp);
            p = endp;
        }
        return v;
    }
};
string jesc(const string& s) {
    string o; o += '"';
    for (char c : s) {
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (c == '\n') o += "\\n";
        else if (c == '\t') o += "\\t";
        else o += c;
    }
    o += '"';
    return o;
}
string jnum(double d) {
    long long ll = (long long)llround(d);
    if (d == (double)ll) return to_string(ll);
    ostringstream os; os << d; return os.str();
}
string jser(const Jv& v) {
    if (v.t == 0) return jnum(v.num);
    if (v.t == 1) return jesc(v.str);
    if (v.t == 2) return v.b ? "true" : "false";
    if (v.t == 4) return "null";
    string o = "[";
    for (size_t i = 0; i < v.arr.size(); ++i) { if (i) o += ','; o += jser(v.arr[i]); }
    return o + "]";
}
template <class T> T jcv(const Jv& v);

template <> long long jcv<long long>(const Jv& v) { return (long long)llround(v.num); }
template <> bool jcv<bool>(const Jv& v) { return v.b; }
template <> string jcv<string>(const Jv& v) { return v.str; }
template <> vector<long long> jcv<vector<long long>>(const Jv& v) {
    vector<long long> o; for (auto& x : v.arr) o.push_back(jcv<long long>(x)); return o;
}
template <> vector<string> jcv<vector<string>>(const Jv& v) {
    vector<string> o; for (auto& x : v.arr) o.push_back(jcv<string>(x)); return o;
}
template <> vector<bool> jcv<vector<bool>>(const Jv& v) {
    vector<bool> o; for (auto& x : v.arr) o.push_back(jcv<bool>(x)); return o;
}
template <> vector<vector<long long>> jcv<vector<vector<long long>>>(const Jv& v) {
    vector<vector<long long>> o; for (auto& x : v.arr) o.push_back(jcv<vector<long long>>(x)); return o;
}
template <class T> string jout(const T& val);
template <> string jout<long long>(const long long& v) { return to_string(v); }
template <> string jout<bool>(const bool& v) { return v ? "true" : "false"; }
template <> string jout<string>(const string& v) { return jesc(v); }
template <> string jout<vector<long long>>(const vector<long long>& v) {
    string o = "["; for (size_t i = 0; i < v.size(); ++i) { if (i) o += ','; o += to_string(v[i]); } return o + "]";
}
template <> string jout<vector<string>>(const vector<string>& v) {
    string o = "["; for (size_t i = 0; i < v.size(); ++i) { if (i) o += ','; o += jesc(v[i]); } return o + "]";
}
template <> string jout<vector<bool>>(const vector<bool>& v) {
    string o = "["; for (size_t i = 0; i < v.size(); ++i) { if (i) o += ','; o += v[i] ? "true" : "false"; } return o + "]";
}
template <> string jout<vector<vector<long long>>>(const vector<vector<long long>>& v) {
    string o = "["; for (size_t i = 0; i < v.size(); ++i) { if (i) o += ','; o += jout<vector<long long>>(v[i]); } return o + "]";
}
`

function buildCppMain(fn: FunctionHarness): string {
  const retType = CPP_TYPE_MAP[fn.returnType]
  const callArgs = fn.params
    .map((p, i) => {
      const t = CPP_TYPE_MAP[p.type]
      return `jcv<${t}>(Jp(lines[${i}]).parse())`
    })
    .join(', ')
  return `

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    vector<string> lines;
    string ln;
    while (getline(cin, ln)) {
        bool blank = true;
        for (char c : ln) if (!isspace((unsigned char)c)) { blank = false; break; }
        if (!blank) lines.push_back(ln);
    }
    cout << jout<${retType}>( ${fn.functionName}( ${callArgs} ) );
    cout.flush();
    return 0;
}
`
}

// --- Go ------------------------------------------------------------------------

const GO_TYPE_MAP: Record<string, string> = {
  number: 'float64',
  'number[]': '[]float64',
  'number[][]': '[][]float64',
  string: 'string',
  'string[]': '[]string',
  boolean: 'bool',
  'boolean[]': '[]bool',
}

const GO_PRELUDE = String.raw`package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
)

func jNum(v any) float64            { return v.(float64) }
func jStr(v any) string             { return v.(string) }
func jBool(v any) bool              { return v.(bool) }
func jNumArr(v any) []float64 {
	out := []float64{}
	for _, x := range v.([]any) { out = append(out, x.(float64)) }
	return out
}
func jStrArr(v any) []string {
	out := []string{}
	for _, x := range v.([]any) { out = append(out, x.(string)) }
	return out
}
func jBoolArr(v any) []bool {
	out := []bool{}
	for _, x := range v.([]any) { out = append(out, x.(bool)) }
	return out
}
func jNumMat(v any) [][]float64 {
	out := [][]float64{}
	for _, x := range v.([]any) { out = append(out, jNumArr(x)) }
	return out
}
func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil { panic(err) }
	return string(b)
}
`

function buildGoMain(fn: FunctionHarness): string {
  const converters: Record<string, string> = {
    number: 'jNum',
    'number[]': 'jNumArr',
    'number[][]': 'jNumMat',
    string: 'jStr',
    'string[]': 'jStrArr',
    boolean: 'jBool',
    'boolean[]': 'jBoolArr',
  }
  const callArgs = fn.params
    .map((p, i) => `${converters[p.type]}(args[${i}])`)
    .join(', ')
  if (!GO_TYPE_MAP[fn.returnType]) {
    throw new Error(`Unsupported return type for Go harness: ${fn.returnType}`)
  }
	return `
func main() {
	data, _ := io.ReadAll(bufio.NewReader(os.Stdin))
	args := []any{}
	for i, line := range strings.Split(string(data), "\\n") {
		if strings.TrimSpace(line) == "" { continue }
		var v any
		if err := json.Unmarshal([]byte(line), &v); err != nil {
			snippet := line
			if len(snippet) > 200 { snippet = snippet[:200] }
			fmt.Fprintf(os.Stderr, "Invalid argument on line %d: expected JSON (e.g. 9, [2,7,11,15], \\"abc\\") but got: %s\\n", i+1, snippet)
			os.Exit(1)
		}
		args = append(args, v)
	}
	fmt.Println(mustJSON(${fn.functionName}(${callArgs})))
}
`
}

// --- Python / JavaScript ---------------------------------------------------------

function pythonHarness(fn: FunctionHarness): string {
  return `

def __cc_main():
    import json as __cc_json, sys as __cc_sys
    lines = [l for l in __cc_sys.stdin.read().splitlines() if l.strip() != '']
    args = []
    for __cc_i, __cc_l in enumerate(lines):
        try:
            args.append(__cc_json.loads(__cc_l))
        except Exception:
            print(
                'Invalid argument on line %d: expected JSON (e.g. 9, [2,7,11,15], "abc") but got: %r'
                % (__cc_i + 1, __cc_l[:200]),
                file=__cc_sys.stderr,
            )
            __cc_sys.exit(1)
    print(__cc_json.dumps(${fn.functionName}(*args)))

__cc_main()
`
}

function jsHarness(fn: FunctionHarness): string {
  return `

;(function () {
  const __ccLines = require('fs').readFileSync(0, 'utf8').split('\\n').filter((l) => l.trim() !== '');
  const __ccArgs = __ccLines.map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      console.error('Invalid argument on line ' + (i + 1) + ': expected JSON (e.g. 9, [2,7,11,15], "abc") but got: ' + JSON.stringify(l.slice(0, 200)));
      process.exit(1);
    }
  });
  console.log(JSON.stringify(${fn.functionName}(...__ccArgs)));
})();
`
}

// --- Public API ---------------------------------------------------------------

export function wrapFunctionCode(opts: {
  code: string
  language: LanguageId
  harness: FunctionHarness
}): string {
  const { code, language, harness } = opts
  const params = harness.params ?? []
  const norm: FunctionHarness = {
    functionName: harness.functionName || 'solve',
    params,
    returnType: harness.returnType || 'number',
  }

  switch (language) {
    case 'python':
      return `${code}\n${pythonHarness(norm)}`
    case 'javascript':
      return `${code}\n${jsHarness(norm)}`
    case 'cpp':
      return `${CPP_PRELUDE}\n${code}\n${buildCppMain(norm)}`
    case 'go':
      return `${GO_PRELUDE}\n${code}\n${buildGoMain(norm)}`
    default:
      throw new Error(`No function harness for language: ${language}`)
  }
}

/**
 * Builds a harness descriptor from a problem document, or null when the
 * problem uses legacy stdin/stdout mode.
 */
export function harnessFromProblem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  problem: any,
): FunctionHarness | null {
  if (!problem) return null
  if ((problem.judgeMode ?? 'function') !== 'function' || !problem.functionName) return null
  return {
    functionName: problem.functionName,
    params: (problem.params ?? []).map((p: { name: string; type: string }) => ({
      name: p.name,
      type: p.type,
    })),
    returnType: problem.returnType ?? 'number',
  }
}
