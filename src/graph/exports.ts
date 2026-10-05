import ts from 'typescript';
import type { Resolver } from '../project/resolve.js';

export interface ExportInventory { names: Set<string>; unknown: boolean }
const inventories = new WeakMap<Resolver, Map<string, ExportInventory>>();
/** Collect runtime export names without executing a module or resolving its types. */
export function runtimeExports(resolver: Resolver, file: string, stack = new Set<string>()): ExportInventory {
  let cache = inventories.get(resolver);
  if (!cache) { cache = new Map(); inventories.set(resolver, cache); }
  const saved = cache.get(file);
  if (saved) return saved;
  if (stack.has(file)) return { names: new Set(), unknown: false };
  const source = resolver.source(file);
  if (!source) return { names: new Set(), unknown: true };
  const names = new Set<string>();
  let unknown = false;
  const next = new Set([...stack, file]);
  for (const statement of source.ast.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (statement.exportClause) {
        if (ts.isNamedExports(statement.exportClause)) {
          for (const entry of statement.exportClause.elements) if (!entry.isTypeOnly) names.add(entry.name.text);
        } else names.add(statement.exportClause.name.text);
      } else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        const target = resolver.resolve(file, statement.moduleSpecifier.text);
        if (target.file) {
          const exports = runtimeExports(resolver, target.file, next);
          for (const name of exports.names) if (name !== 'default') names.add(name);
          unknown ||= exports.unknown;
        } else unknown = true;
      }
      continue;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) { names.add('default'); continue; }
    if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;
    if (ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) names.add('default');
    else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        else unknown = true;
      }
    } else unknown = true;
  }
  const result = { names, unknown };
  // A cycle can still gain names from a caller. Cache only independent traversals.
  if (stack.size === 0) cache.set(file, result);
  return result;
}
