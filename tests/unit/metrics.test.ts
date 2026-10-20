import { describe, test, expect } from 'vitest';
import ts from 'typescript';
import { tokens, codeLines, decisions, cognitive, maxNesting, halsteadVolume, maintainabilityIndex, independentCycles, duplicatedLines } from '../../src/metrics/code.js';
import { verifyReport } from '../../src/report/json.js';
import { scan } from './helpers.js';

const parse = (text: string, name = 'sample.tsx'): ts.SourceFile => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
const firstFunction = (ast: ts.SourceFile): ts.FunctionDeclaration => ast.statements.find(ts.isFunctionDeclaration)!;

describe('code metrics nsg-metrics-1 (hand-computed expectations)', () => {
  test('M-01 counts lines with tokens and ignores comments and blank lines', () => {
    const ast = parse(['// comment', "import { a } from './a';", '', '/* block', '   comment */', 'export function f(x: number) {', '  return x; // trailing', '}'].join('\n'), 'loc.ts');
    expect([...codeLines(tokens(ast))].sort((a, b) => a - b)).toEqual([2, 6, 7, 8]);
  });

  test('M-01 ignores whitespace-only JSX lines', () => {
    const ast = parse(['export default function P() {', '  return (', '    <div>', '', '      Hola', '    </div>', '  );', '}'].join('\n'));
    expect([...codeLines(tokens(ast))].sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 6, 7, 8]);
  });

  test('M-02 adds if, loops, catch, ternaries, non-default cases and each &&, || and ??', () => {
    const fn = firstFunction(parse(`function g(a: any, b: any, c: any) {
  if (a && b) { return 1; }
  for (const x of c) { if (x ?? a) continue; }
  switch (a) { case 1: break; case 2: break; default: break; }
  try { b(); } catch { return a ? 2 : 3; }
  return b || c;
}`, 'cc.ts'));
    // if, &&, for-of, inner if, ??, 2 cases, catch, ternary, || = 10 decisions.
    expect(1 + decisions(fn)).toBe(11);
  });

  const nested = `function h(a: any, b: any, c: any) {
  if (a) {
    for (const x of b) {
      if (x && c && a || b) { }
    }
  } else if (b) {
  } else {
  }
  const f = () => { if (a) {} };
  return c ? 1 : 2;
}`;

  test('M-03 cognitive adaptation: nesting increments, else/else-if, logical sequences, nested functions apart', () => {
    // if +1, for +2, inner if +3, sequence &&…|| +2, else-if +1, else +1, ternary +1 = 11; the arrow function is measured separately.
    expect(cognitive(firstFunction(parse(nested, 'cog.ts')))).toBe(11);
  });

  test('M-04 nesting keeps else-if on the same level and skips nested functions', () => {
    expect(maxNesting(firstFunction(parse(nested, 'nest.ts')))).toBe(3);
  });

  test('M-05 Halstead volume is N × log2(n)', () => {
    // a = b + a ; → N = 6, vocabulary {a, =, b, +, ;} = 5.
    expect(halsteadVolume(tokens(parse('a = b + a;', 'h.ts')))).toBeCloseTo(6 * Math.log2(5), 10);
  });

  test('M-06 maintainability index normalized to 0–100 and not applicable without code', () => {
    expect(maintainabilityIndex(1000, 10, 100)).toBeCloseTo((171 - 5.2 * Math.log(1000) - 0.23 * 10 - 16.2 * Math.log(100)) * 100 / 171, 10);
    expect(maintainabilityIndex(1000, 10, 100)).toBeCloseTo(34.021, 3);
    expect(maintainabilityIndex(0, 1, 0)).toBeNull();
    expect(maintainabilityIndex(1e12, 500, 1e6)).toBe(0);
  });

  test('M-08 counts independent cycles per strongly connected component', () => {
    const edges = new Map([['A', new Set(['B'])], ['B', new Set(['A', 'C'])], ['C', new Set(['B', 'D'])]]);
    expect(independentCycles(['A', 'B', 'C', 'D'], edges)).toBe(2);
    expect(independentCycles(['E'], new Map([['E', new Set(['E'])]]))).toBe(1);
    expect(independentCycles(['A', 'B'], new Map([['A', new Set(['B'])]]))).toBe(0);
  });

  const block = `export function same(a: number, b: number) {
  const c = a + b;
  const d = a * b;
  const e = c - d;
  if (c > d) { return c; }
  return e + a + b;
}`;

  test('M-09 marks blocks of at least 50 tokens and five lines repeated in another place', () => {
    const a = tokens(parse(block, 'a.ts')), b = tokens(parse(block, 'b.ts'));
    expect(a.length).toBeGreaterThanOrEqual(50);
    const result = duplicatedLines([{ file: 'a.ts', tokens: a }, { file: 'b.ts', tokens: b }]);
    expect(result.partial).toBe(false);
    expect(result.lines.get('a.ts')?.size).toBe(7);
    expect(result.lines.get('b.ts')?.size).toBe(7);
  });

  test('M-09 ignores short repetitions and reports partial duplication beyond the budget', () => {
    const short = tokens(parse('export const x = 1 + 2;', 's1.ts'));
    expect(duplicatedLines([{ file: 's1.ts', tokens: short }, { file: 's2.ts', tokens: short }]).lines.size).toBe(0);
    const a = tokens(parse(block, 'a.ts'));
    const limited = duplicatedLines([{ file: 'a.ts', tokens: a }, { file: 'b.ts', tokens: a }], a.length + 1);
    expect(limited.partial).toBe(true);
    expect(limited.lines.size).toBe(0);
  });

  test('M-10 to M-13 over a scanned application, with a schema-valid report', async () => {
    const report = await scan({
      'app/page.tsx': "import Client from './client';export default function Page(){const v=process.env.TOKEN;return <Client data={v}/>;}",
      'app/client.tsx': "'use client';export default function Client(props:{data:unknown}){return <p>{String(props.data)}</p>;}",
    }, { schemaVersion: 1, sensitive: { env: [{ name: 'TOKEN', category: 'secret' }] } });
    verifyReport(report);
    const m = report.codeMetrics!;
    expect(m.protocol).toBe('nsg-metrics-1');
    expect(m.scope.files).toBe(3);
    expect(m.loc).toBe(3);
    expect(m.boundaryCrossings).toBe(1);
    expect(m.clientSurface).toEqual({ ratio: 0.333, clientLoc: 1 });
    expect(m.exposure).toEqual({ ratio: 1, exposed: 1, declared: 1 });
    expect(m.findingsPerKloc?.critical).toBe(333.333);
    expect(m.independentCycles).toBe(0);
    expect(JSON.stringify(m)).not.toContain('process.env.TOKEN');
  });

  test('M-07 excludes type-only imports from efferent coupling', async () => {
    const report = await scan({
      'app/page.tsx': "import type { T } from './types';import { helper } from './helper';export default function Page(){const t: T = helper();return <p>{String(t)}</p>;}",
      'app/types.ts': 'export type T = number;',
      'app/helper.ts': 'export function helper() { return 1; }',
    });
    const page = report.codeMetrics!.files.find(f => f.file === 'app/page.tsx')!;
    expect(page.coupling).toBe(1);
  });
});
