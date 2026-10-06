import ts from 'typescript';
import { retainsBinding } from '../graph/build.js';
import type { Graph } from '../graph/build.js';
import { isClient } from '../graph/contexts.js';
import { resolveReference } from '../analysis/symbols.js';
import type { Execution } from '../analysis/phases.js';
import type { Evidence } from '../types.js';
import { location } from '../project/location.js';
import { Diagnostics } from './shared.js';
export const FILESYSTEM=/^(?:node:)?fs(?:\/promises)?(?:#|$)/;
export const SERVER_APIS=new Set(['next/headers#headers','next/headers#cookies','next/cache#revalidatePath']);
export function checkServerDependency(graph:Graph,diagnostics:Diagnostics,node:ts.Node,state:Execution):void {
 if(!isClient(state.context))return;
 if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0])&&FILESYSTEM.test(node.arguments[0].text)) {
  const module=node.arguments[0].text;
  diagnostics.finding('NSG001',node,state.context,[...state.trace,{kind:'import',location:location(node),symbol:module}],`${module}#<module>`,'client');return;
 }
 if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)) {
  const clause=node.importClause;
  if(clause){if(clause.isTypeOnly)return;const names:string[]=[];if(clause.name)names.push(clause.name.text);if(clause.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))names.push(clause.namedBindings.name.text);else for(const element of clause.namedBindings.elements)if(!element.isTypeOnly)names.push(element.name.text);}if(clause.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.length&&!names.length)return;if(!names.some(n=>retainsBinding(node.getSourceFile(),n,graph.resolver.config.verbatimModuleSyntax))&&(names.length||/\.tsx?$/.test(node.getSourceFile().fileName)&&!graph.resolver.config.verbatimModuleSyntax))return;}
  const name=node.moduleSpecifier.text;
  if(name!=='server-only'&&!(FILESYSTEM.test(name)&&!node.importClause))return;
  let site:ts.Node=node;
  if(name==='server-only') {
   const primary=state.trace.find(e=>e.kind==='import')?.location;
   if(primary)site=graph.resolver.source(primary.file)?.ast.statements.find(s=>s.getStart()===primary.start.offset)??node;
  }
  diagnostics.finding('NSG001',site,state.context,[...state.trace,{kind:'import',location:location(node),symbol:name}],`${name}#<module>`,'client');return;
 }
 if(!(ts.isCallExpression(node)||ts.isIdentifier(node)||ts.isPropertyAccessExpression(node)))return;
 const parent=node.parent;
 if(!ts.isCallExpression(node)&&(ts.isImportSpecifier(parent)||ts.isImportClause(parent)||ts.isNamespaceImport(parent)||ts.isPropertyAccessExpression(parent)||ts.isElementAccessExpression(parent)||(ts.isCallExpression(parent)&&parent.expression===node)))return;
 const api=resolveReference(graph,ts.isCallExpression(node)?node.expression:node).api;
 if(!api||(!SERVER_APIS.has(api)&&!FILESYSTEM.test(api)))return;
 const evidence:Evidence[]=[...state.trace,{kind:'api',location:location(node),symbol:api}];
 diagnostics.finding('NSG001',node,state.context,evidence,api,'client');
}
