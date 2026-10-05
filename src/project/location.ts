import type ts from 'typescript';
import type { Location } from '../types.js';
export function location(node: ts.Node, file = node.getSourceFile().fileName): Location {
  const ast = node.getSourceFile();
  const start = node.getStart(ast), end = node.getEnd();
  const a = ast.getLineAndCharacterOfPosition(start), b = ast.getLineAndCharacterOfPosition(end);
  return {file, start: {line: a.line + 1, column: a.character + 1, offset: start}, end: {line: b.line + 1, column: b.character + 1, offset: end}};
}
