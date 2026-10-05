import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { Policy } from '../types.js';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sha256(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
export function policyHash(policy: Policy): string { return sha256(canonical({ ...policy, exceptions: policy.exceptions.map(({reason: _reason, ...entry}) => entry) })); }
export function shape(node: ts.Node): unknown {
  if (ts.isTypeNode(node)) return null;
  if (ts.isIdentifier(node)) return ['Identifier', node.text];
  if (ts.isStringLiteralLike(node)) return ['string'];
  if (ts.isNumericLiteral(node)) return ['number'];
  if (ts.isBigIntLiteral(node)) return ['bigint'];
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return ['boolean'];
  if (node.kind === ts.SyntaxKind.NullKeyword) return ['null'];
  const children: unknown[] = [];
  ts.forEachChild(node, child => { const item = shape(child); if (item !== null) children.push(item); });
  return [ts.SyntaxKind[node.kind], ...children];
}
export function qualifiedSymbol(node: ts.Node): string {
  const names: string[] = [];
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p) || ts.isClassDeclaration(p)) {
      const named = 'name' in p ? p.name : undefined;
      if (named && ts.isIdentifier(named)) names.unshift(named.text);
      else if (ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) names.unshift(p.parent.name.text);
      else {
        let index = 0;
        ts.forEachChild(p.parent, sibling => { if (sibling.pos < p.pos && ts.isFunctionLike(sibling) && !sibling.name) index++; });
        names.unshift(`<anonymous:${index}>`);
      }
    }
  }
  return names.join('/') || '<module>';
}
export function fingerprint(rule: string, file: string, node: ts.Node, origin: string, destination: string): {hash: string; tuple: string} {
  const symbol = qualifiedSymbol(node), siteShape = shape(node), normalized = canonical(siteShape);
  let ordinal = 0;
  const walk = (n: ts.Node): void => {
    if (n === node || n.getStart() >= node.getStart()) return;
    if (n.kind === node.kind && qualifiedSymbol(n) === symbol && canonical(shape(n)) === normalized) ordinal++;
    ts.forEachChild(n, walk);
  };
  walk(node.getSourceFile());
  const tuple = canonical([1, rule, file, symbol, siteShape, ordinal, origin, destination]);
  return { hash: sha256(tuple), tuple };
}
