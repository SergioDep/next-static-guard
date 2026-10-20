import ts from 'typescript';
import type { Graph } from '../graph/build.js';
import { retainsBinding } from '../graph/build.js';
import type { Context, Finding, Policy, Severity, SourceNode } from '../types.js';

/** Protocol identifier for the code metrics M-01 to M-13 (Anexo H, Tabla H2). */
export const METRICS_PROTOCOL = 'nsg-metrics-1';
/** Minimum duplicated block: 50 tokens spanning at least five lines. */
export const DUPLICATION_TOKENS = 50;
export const DUPLICATION_LINES = 5;
/** Token budget for the duplication search; larger scopes report partial duplication. */
export const DUPLICATION_BUDGET = 200_000;

export interface FunctionMetrics { name: string; line: number; cyclomatic: number; cognitive: number; nesting: number }
export interface FileMetrics {
  file: string;
  loc: number;
  cyclomatic: number;
  cognitive: number;
  maxNesting: number;
  halsteadVolume: number;
  maintainability: number | null;
  coupling: number;
  contexts: Context[];
  functions: FunctionMetrics[];
}
export interface CodeMetrics {
  protocol: typeof METRICS_PROTOCOL;
  scope: { files: number; functions: number };
  loc: number;
  cyclomatic: { total: number; maxFunction: number; meanFunction: number };
  cognitive: { total: number; maxFunction: number };
  nesting: { max: number };
  halsteadVolume: { total: number };
  maintainability: { mean: number | null; min: number | null };
  coupling: { total: number; maxFile: number };
  independentCycles: number;
  duplication: { ratio: number | null; duplicatedLoc: number; partial: boolean };
  boundaryCrossings: number;
  clientSurface: { ratio: number | null; clientLoc: number };
  exposure: { ratio: number | null; exposed: number; declared: number };
  findingsPerKloc: Record<Severity, number> | null;
  files: FileMetrics[];
}

interface Token { text: string; operand: boolean; line: number; endLine: number }
interface FileFacts { node: SourceNode; graph: Graph; contexts: Set<Context>; tokens: Token[]; lines: Set<number> }

const round = (value: number): number => Math.round(value * 1000) / 1000;
const SERVER_CONTEXTS: ReadonlySet<Context> = new Set(['rsc', 'server-function', 'server-handler']);
const CLIENT_CONTEXTS: ReadonlySet<Context> = new Set(['client-ssr', 'client-browser']);

function isOperand(node: ts.Node): boolean {
  return ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) || ts.isRegularExpressionLiteral(node) || ts.isJsxText(node) ||
    node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail;
}

/** Leaf tokens of the syntax tree: comments, JSDoc and whitespace-only JSX text are excluded. */
export function tokens(ast: ts.SourceFile): Token[] {
  const out: Token[] = [];
  const lineOf = (pos: number): number => ast.getLineAndCharacterOfPosition(pos).line + 1;
  const visit = (node: ts.Node): void => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    const children = node.getChildren(ast);
    if (children.length) { for (const child of children) visit(child); return; }
    if (ts.isJsxText(node)) {
      if (node.containsOnlyTriviaWhiteSpaces) return;
      // Only lines with visible JSX text count as code lines.
      const start = node.getStart(ast), text = node.getText(ast);
      let offset = 0;
      for (const part of text.split('\n')) {
        if (part.trim()) out.push({ text: part.trim(), operand: true, line: lineOf(start + offset), endLine: lineOf(start + offset) });
        offset += part.length + 1;
      }
      return;
    }
    const start = node.getStart(ast), end = node.getEnd();
    if (end <= start) return;
    out.push({ text: node.getText(ast), operand: isOperand(node), line: lineOf(start), endLine: lineOf(end - 1) });
  };
  visit(ast);
  return out;
}

/** M-01: physical lines occupied by at least one syntax token. */
export function codeLines(list: readonly Token[]): Set<number> {
  const lines = new Set<number>();
  for (const token of list) for (let line = token.line; line <= token.endLine; line++) lines.add(line);
  return lines;
}

/** M-05: Halstead volume N × log2(n) over operators (keywords, punctuation) and operands (identifiers, literals). */
export function halsteadVolume(list: readonly Token[]): number {
  if (!list.length) return 0;
  const vocabulary = new Set<string>();
  // Token texts stay in memory; only counts leave this function.
  for (const token of list) vocabulary.add((token.operand ? 'o:' : 'p:') + token.text);
  return vocabulary.size > 1 ? list.length * Math.log2(vocabulary.size) : 0;
}

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration;
function isFunctionUnit(node: ts.Node): node is FunctionLike {
  return (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && !!node.body;
}
function functionName(node: FunctionLike, ast: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (node.name && (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name) || ts.isStringLiteral(node.name))) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent) && (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))) return parent.name.text;
  if (ts.isExportAssignment(parent)) return 'default';
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) return `${parent.parent.name.getText(ast)} handler`;
  return '<anonymous>';
}

const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);
const isLogical = (node: ts.Node): node is ts.BinaryExpression => ts.isBinaryExpression(node) && LOGICAL.has(node.operatorToken.kind);
const isLoop = (node: ts.Node): boolean => ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node);

/** Visits the descendants of a unit without entering nested functions, which are measured separately. */
function forEachOwn(node: ts.Node, visit: (child: ts.Node) => void): void {
  ts.forEachChild(node, child => { if (!isFunctionUnit(child)) visit(child); });
}

/** M-02: 1 + if, loops, catch, ternaries, non-default cases and each &&, || or ??. */
export function decisions(root: ts.Node): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || isLoop(node) || ts.isCatchClause(node) || ts.isCaseClause(node) || isLogical(node)) count++;
    forEachOwn(node, visit);
  };
  forEachOwn(root, visit);
  return count;
}

/** Operators of a flattened logical expression in source order; parentheses do not break the chain. */
function logicalSequence(node: ts.Expression, out: ts.SyntaxKind[], operands: ts.Expression[]): void {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (isLogical(node)) { logicalSequence(node.left, out, operands); out.push(node.operatorToken.kind); logicalSequence(node.right, out, operands); }
  else operands.push(node);
}

/** M-03: cognitive complexity adapted to the AST (structures add 1 + nesting; else/else-if, logical sequences and labeled jumps add 1). */
export function cognitive(root: ts.Node): number {
  let score = 0;
  const visit = (node: ts.Node, nesting: number): void => {
    if (isFunctionUnit(node)) return;
    if (ts.isIfStatement(node)) {
      const elseIf = ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
      score += elseIf ? 1 : 1 + nesting;
      visit(node.expression, nesting);
      visit(node.thenStatement, nesting + 1);
      if (node.elseStatement) {
        if (ts.isIfStatement(node.elseStatement)) visit(node.elseStatement, nesting);
        else { score += 1; visit(node.elseStatement, nesting + 1); }
      }
      return;
    }
    if (ts.isConditionalExpression(node) || ts.isSwitchStatement(node) || isLoop(node) || ts.isCatchClause(node)) {
      score += 1 + nesting;
      ts.forEachChild(node, child => visit(child, nesting + 1));
      return;
    }
    if ((ts.isBreakStatement(node) || ts.isContinueStatement(node)) && node.label) score += 1;
    if (isLogical(node)) {
      const operators: ts.SyntaxKind[] = [], operands: ts.Expression[] = [];
      logicalSequence(node, operators, operands);
      score += operators.filter((op, i) => i === 0 || op !== operators[i - 1]).length;
      for (const operand of operands) visit(operand, nesting);
      return;
    }
    ts.forEachChild(node, child => visit(child, nesting));
  };
  ts.forEachChild(root, child => visit(child, 0));
  return score;
}

/** M-04: deepest nesting of control structures; an else-if chain stays on the same level and plain blocks add nothing. */
export function maxNesting(root: ts.Node): number {
  let max = 0;
  const visit = (node: ts.Node, depth: number): void => {
    if (isFunctionUnit(node)) return;
    const structure = (ts.isIfStatement(node) && !(ts.isIfStatement(node.parent) && node.parent.elseStatement === node)) || isLoop(node) || ts.isSwitchStatement(node) || ts.isTryStatement(node);
    const level = structure ? depth + 1 : depth;
    if (level > max) max = level;
    ts.forEachChild(node, child => visit(child, level));
  };
  ts.forEachChild(root, child => visit(child, 0));
  return max;
}

/** M-06: maintainability index normalized to 0–100; not applicable without code lines. */
export function maintainabilityIndex(volume: number, cyclomatic: number, loc: number): number | null {
  if (loc <= 0) return null;
  const raw = 171 - 5.2 * Math.log(Math.max(1, volume)) - 0.23 * cyclomatic - 16.2 * Math.log(loc);
  return Math.max(0, Math.min(100, raw * 100 / 171));
}

interface Edge { from: string; to: string | null; key: string; specifier: string }
/** Runtime import destinations of a file: type-only imports and elided bindings are excluded, resources are ignored. */
function runtimeEdges(node: SourceNode, graph: Graph): Edge[] {
  const resolver = graph.resolver, path = node.file.path, out: Edge[] = [];
  const add = (specifier: string): void => {
    const resolution = resolver.resolve(path, specifier);
    if (resolution.resource) return;
    const key = resolution.file ?? (resolution.package ? `package:${resolution.package}` : `module:${specifier}`);
    out.push({ from: path, to: resolution.file, key, specifier });
  };
  for (const statement of node.ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause) {
        const names: string[] = [];
        if (clause.name) names.push(clause.name.text);
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) names.push(clause.namedBindings.name.text);
          else for (const element of clause.namedBindings.elements) if (!element.isTypeOnly) names.push(element.name.text);
        }
        const typeOnlyNamed = !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && !names.length;
        if (typeOnlyNamed) continue;
        if (!names.some(name => retainsBinding(node.ast, name, resolver.config.verbatimModuleSyntax))) continue;
      }
      add(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.length && statement.exportClause.elements.every(e => e.isTypeOnly)) continue;
      add(statement.moduleSpecifier.text);
    }
  }
  const dynamic = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = n.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) add(argument.text);
    }
    ts.forEachChild(n, dynamic);
  };
  dynamic(node.ast);
  return out;
}

/** M-08: independent cycles E − V + 1 for every strongly connected component that contains a cycle. */
export function independentCycles(nodes: readonly string[], edges: ReadonlyMap<string, ReadonlySet<string>>): number {
  let index = 0, total = 0;
  const indexes = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], onStack = new Set<string>();
  const strong = (v: string): void => {
    indexes.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!indexes.has(w)) { strong(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, indexes.get(w)!));
    }
    if (low.get(v) === indexes.get(v)) {
      const component = new Set<string>();
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); component.add(w); } while (w !== v);
      let inner = 0;
      for (const from of component) for (const to of edges.get(from) ?? []) if (component.has(to)) inner++;
      if (component.size > 1 || inner > 0) total += inner - component.size + 1;
    }
  };
  for (const node of [...nodes].sort()) if (!indexes.has(node)) strong(node);
  return total;
}

/** M-09: lines covered by exact token blocks of at least 50 tokens and five lines that occur at least twice without overlapping. */
export function duplicatedLines(files: ReadonlyArray<{ file: string; tokens: readonly Token[] }>, budget = DUPLICATION_BUDGET): { lines: Map<string, Set<number>>; partial: boolean } {
  const lines = new Map<string, Set<number>>();
  let used = 0, partial = false;
  const included: { file: string; tokens: readonly Token[] }[] = [];
  for (const entry of files) {
    if (used + entry.tokens.length > budget) { partial = true; continue; }
    used += entry.tokens.length; included.push(entry);
  }
  // Rolling polynomial hash over token ids with two moduli below 2^26, so every product stays exact in a double.
  const P1 = 67108859, P2 = 67108837, BASE = 131;
  const ids = new Map<string, number>();
  const idOf = (text: string): number => { let id = ids.get(text); if (id === undefined) { id = ids.size + 1; ids.set(text, id); } return id; };
  let pow1 = 1, pow2 = 1;
  for (let i = 0; i < DUPLICATION_TOKENS; i++) { pow1 = (pow1 * BASE) % P1; pow2 = (pow2 * BASE) % P2; }
  const windows = new Map<number, { file: number; start: number }[]>();
  const sequences = included.map(entry => entry.tokens.map(token => idOf(token.text)));
  included.forEach((entry, fileIndex) => {
    const list = entry.tokens, seq = sequences[fileIndex]!;
    const h1 = new Array<number>(seq.length + 1).fill(0), h2 = new Array<number>(seq.length + 1).fill(0);
    for (let i = 0; i < seq.length; i++) { h1[i + 1] = (h1[i]! * BASE + seq[i]!) % P1; h2[i + 1] = (h2[i]! * BASE + seq[i]!) % P2; }
    for (let start = 0; start + DUPLICATION_TOKENS <= list.length; start++) {
      const first = list[start]!, last = list[start + DUPLICATION_TOKENS - 1]!;
      if (last.endLine - first.line + 1 < DUPLICATION_LINES) continue;
      const end = start + DUPLICATION_TOKENS;
      const a = ((h1[end]! - h1[start]! * pow1) % P1 + P1) % P1, b = ((h2[end]! - h2[start]! * pow2) % P2 + P2) % P2;
      const key = a * P2 + b;
      const bucket = windows.get(key) ?? [];
      bucket.push({ file: fileIndex, start });
      windows.set(key, bucket);
    }
  });
  const same = (x: { file: number; start: number }, y: { file: number; start: number }): boolean => {
    const a = sequences[x.file]!, b = sequences[y.file]!;
    for (let i = 0; i < DUPLICATION_TOKENS; i++) if (a[x.start + i] !== b[y.start + i]) return false;
    return true;
  };
  const covered = included.map(entry => new Array<boolean>(entry.tokens.length).fill(false));
  for (const bucket of windows.values()) {
    if (bucket.length < 2) continue;
    for (const a of bucket) {
      const partner = bucket.some(b => b !== a && (b.file !== a.file || Math.abs(b.start - a.start) >= DUPLICATION_TOKENS) && same(a, b));
      if (!partner) continue;
      for (let i = a.start; i < a.start + DUPLICATION_TOKENS; i++) covered[a.file]![i] = true;
    }
  }
  included.forEach((entry, fileIndex) => {
    const set = new Set<number>();
    entry.tokens.forEach((token, i) => { if (covered[fileIndex]![i]) for (let line = token.line; line <= token.endLine; line++) set.add(line); });
    if (set.size) lines.set(entry.file, set);
  });
  return { lines, partial };
}

/** Declared confidential sources, using the same identifiers as NSG005 evidence. */
function declaredSources(policy: Policy): Set<string> {
  const sources = new Set<string>();
  for (const env of policy.sensitive.env) sources.add(`env#${env.name}`);
  for (const declaration of policy.sensitive.exports) sources.add(`${declaration.file}#${declaration.export}${JSON.stringify(declaration.field)}`);
  return sources;
}

/** Computes M-01 to M-13 over the source files reached by the contextual graphs. The application code is never executed. */
export function measureCode(graphs: readonly Graph[], policy: Policy, findings: readonly Finding[]): CodeMetrics {
  const facts = new Map<string, FileFacts>();
  for (const graph of graphs) for (const use of graph.uses) {
    const path = use.node.file.path;
    if (path.endsWith('.json')) continue;
    const existing = facts.get(path);
    if (existing) { existing.contexts.add(use.context); continue; }
    const list = tokens(use.node.ast);
    facts.set(path, { node: use.node, graph, contexts: new Set([use.context]), tokens: list, lines: codeLines(list) });
  }
  const paths = [...facts.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  const files: FileMetrics[] = [];
  const localEdges = new Map<string, Set<string>>();
  const crossings = new Set<string>();
  let totalLoc = 0, clientLoc = 0;
  for (const path of paths) {
    const fact = facts.get(path)!, ast = fact.node.ast;
    const units: FunctionMetrics[] = [];
    const collect = (node: ts.Node): void => {
      if (isFunctionUnit(node)) {
        units.push({ name: functionName(node, ast), line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, cyclomatic: 1 + decisions(node), cognitive: cognitive(node), nesting: maxNesting(node) });
      }
      ts.forEachChild(node, collect);
    };
    collect(ast);
    const moduleDecisions = decisions(ast);
    const cyclomatic = units.reduce((sum, unit) => sum + unit.cyclomatic, 0) + moduleDecisions;
    const loc = fact.lines.size, volume = halsteadVolume(fact.tokens);
    const edges = runtimeEdges(fact.node, fact.graph);
    const destinations = new Set(edges.map(edge => edge.key));
    for (const edge of edges) {
      if (!edge.to || !facts.has(edge.to) || edge.to.endsWith('.json')) continue;
      const set = localEdges.get(path) ?? new Set<string>(); set.add(edge.to); localEdges.set(path, set);
      const target = facts.get(edge.to)!.node;
      for (const context of fact.contexts) {
        if (SERVER_CONTEXTS.has(context) && target.directive === 'client') crossings.add(`${path}->${edge.to}`);
        if (CLIENT_CONTEXTS.has(context) && target.directive === 'server') crossings.add(`${path}->${edge.to}`);
      }
    }
    totalLoc += loc;
    if (fact.contexts.has('client-browser')) clientLoc += loc;
    files.push({
      file: path, loc, cyclomatic, cognitive: units.reduce((sum, unit) => sum + unit.cognitive, 0) + cognitive(ast),
      maxNesting: Math.max(maxNesting(ast), ...units.map(unit => unit.nesting), 0), halsteadVolume: round(volume),
      maintainability: (() => { const mi = maintainabilityIndex(volume, Math.max(1, cyclomatic), loc); return mi === null ? null : round(mi); })(),
      coupling: destinations.size, contexts: [...fact.contexts].sort(), functions: units,
    });
  }
  const functions = files.flatMap(file => file.functions);
  const validMi = files.map(file => file.maintainability).filter((mi): mi is number => mi !== null);
  const duplication = duplicatedLines(paths.map(path => ({ file: path, tokens: facts.get(path)!.tokens })));
  const duplicatedLoc = [...duplication.lines.values()].reduce((sum, set) => sum + set.size, 0);
  const declared = declaredSources(policy);
  const exposed = new Set<string>();
  for (const finding of findings) if (finding.ruleId === 'NSG005' && !finding.suppressed)
    for (const evidence of finding.evidence) if (evidence.kind === 'source' && evidence.symbol && declared.has(evidence.symbol)) exposed.add(evidence.symbol);
  const density = (severity: Severity): number => round(findings.filter(f => !f.suppressed && f.severity === severity).length * 1000 / totalLoc);
  return {
    protocol: METRICS_PROTOCOL,
    scope: { files: files.length, functions: functions.length },
    loc: totalLoc,
    cyclomatic: { total: files.reduce((sum, f) => sum + f.cyclomatic, 0), maxFunction: Math.max(0, ...functions.map(f => f.cyclomatic)), meanFunction: functions.length ? round(functions.reduce((sum, f) => sum + f.cyclomatic, 0) / functions.length) : 0 },
    cognitive: { total: files.reduce((sum, f) => sum + f.cognitive, 0), maxFunction: Math.max(0, ...functions.map(f => f.cognitive)) },
    nesting: { max: Math.max(0, ...files.map(f => f.maxNesting)) },
    halsteadVolume: { total: round(files.reduce((sum, f) => sum + f.halsteadVolume, 0)) },
    maintainability: { mean: validMi.length ? round(validMi.reduce((a, b) => a + b, 0) / validMi.length) : null, min: validMi.length ? Math.min(...validMi) : null },
    coupling: { total: files.reduce((sum, f) => sum + f.coupling, 0), maxFile: Math.max(0, ...files.map(f => f.coupling)) },
    independentCycles: independentCycles(paths, localEdges),
    duplication: { ratio: totalLoc ? round(duplicatedLoc / totalLoc) : null, duplicatedLoc, partial: duplication.partial },
    boundaryCrossings: crossings.size,
    clientSurface: { ratio: totalLoc ? round(clientLoc / totalLoc) : null, clientLoc },
    exposure: { ratio: declared.size ? round(exposed.size / declared.size) : null, exposed: exposed.size, declared: declared.size },
    findingsPerKloc: totalLoc ? { critical: density('critical'), high: density('high'), medium: density('medium'), info: density('info') } : null,
    files,
  };
}
