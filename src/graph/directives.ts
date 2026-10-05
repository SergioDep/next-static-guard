import ts from 'typescript';
export function directives(ast: ts.SourceFile | ts.Block): {directive:'client'|'server'|null; invalid:boolean} {
  let client = false, server = false, invalid = false, prologue = true;
  for (const statement of ast.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && prologue) {
      client ||= statement.expression.text === 'use client'; server ||= statement.expression.text === 'use server';
    } else {
      prologue = false;
      if (ts.isExpressionStatement(statement)) {
        let expression = statement.expression;
        while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
        if ((ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) && ['use client','use server'].includes(expression.text)) invalid = true;
      }
    }
  }
  return {directive:client?'client':server?'server':null,invalid:invalid || (client && server)};
}
export function isAsyncFunction(node: ts.Node): node is ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction { return (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && !!node.body && !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword); }
export function inlineServer(node: ts.Node): boolean { return isAsyncFunction(node) && ts.isBlock(node.body!) && directives(node.body!).directive === 'server' && !directives(node.body!).invalid; }
