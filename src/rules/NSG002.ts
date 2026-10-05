import ts from 'typescript';
import { retainsBinding } from '../graph/build.js';
import type { Graph } from '../graph/build.js';
import { resolveReference } from '../analysis/symbols.js';
import type { Execution } from '../analysis/phases.js';
import { location } from '../project/location.js';
import { Diagnostics } from './shared.js';
export const CLIENT_HOOKS=new Set(['react#useState','react#useEffect','react#useReducer','next/navigation#useRouter']);
export function checkClientDependency(graph:Graph,diagnostics:Diagnostics,node:ts.Node,state:Execution):void {
 if(state.context!=='rsc')return;
 if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text==='client-only') {
  const clause=node.importClause;
  if(clause){if(clause.isTypeOnly)return;const names:string[]=[];if(clause.name)names.push(clause.name.text);if(clause.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))names.push(clause.namedBindings.name.text);else for(const element of clause.namedBindings.elements)if(!element.isTypeOnly)names.push(element.name.text);}if(clause.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.length&&!names.length)return;if(!names.some(n=>retainsBinding(node.getSourceFile(),n,graph.resolver.config.verbatimModuleSyntax))&&(names.length||/\.tsx?$/.test(node.getSourceFile().fileName)&&!graph.resolver.config.verbatimModuleSyntax))return;}
  let site:ts.Node=node;
  const primary=state.trace.find(e=>e.kind==='import')?.location;
  if(primary)site=graph.resolver.source(primary.file)?.ast.statements.find(s=>s.getStart()===primary.start.offset)??node;
  diagnostics.finding('NSG002',site,state.context,[...state.trace,{kind:'import',location:location(node),symbol:'client-only'}],'client-only#<module>','rsc');return;
 }
 if(!ts.isCallExpression(node))return;
 const api=resolveReference(graph,node.expression).api;
 if(api&&CLIENT_HOOKS.has(api))diagnostics.finding('NSG002',node,state.context,[...state.trace,{kind:'api',location:location(node),symbol:api}],api,'rsc');
}
