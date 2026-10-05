import ts from 'typescript';
import type { Graph } from '../graph/build.js';
import { retainsBinding } from '../graph/build.js';
import { resolveReference } from '../analysis/symbols.js';
import { isClient } from '../graph/contexts.js';
import { location } from '../project/location.js';
import { SERVER_APIS, FILESYSTEM } from './NSG001.js';
import { CLIENT_HOOKS } from './NSG002.js';
import type { Diagnostics } from './shared.js';

/** Next's import restrictions apply before an exported function is called. */
export function checkRetainedApiImports(graph:Graph,diagnostics:Diagnostics):void {
  const observed=diagnostics.findings.map(finding=>{
    const source=graph.resolver.source(finding.location.file);let site:ts.Node|undefined;
    const find=(node:ts.Node):void=>{if(node.pos>finding.location.start.offset||node.end<finding.location.end.offset)return;if(node.getStart()===finding.location.start.offset&&node.end===finding.location.end.offset)site=node;ts.forEachChild(node,find);};
    if(source)find(source.ast);
    const reference=site?resolveReference(graph,ts.isCallExpression(site)?site.expression:site):null;
    return {finding,reference};
  });
  for(const use of graph.uses)for(const binding of graph.bindings.get(use.node.file.path)?.values()??[]) {
    if(!binding.resolution.package||binding.imported==='*'||!retainsBinding(use.node.ast,binding.local,graph.resolver.config.verbatimModuleSyntax))continue;
    const api=`${binding.resolution.package}#${binding.imported}`;
    const rule=isClient(use.context)&&(SERVER_APIS.has(api)||FILESYSTEM.test(api))?'NSG001':use.context==='rsc'&&CLIENT_HOOKS.has(api)?'NSG002':null;
    if(!rule)continue;
    const alreadyReported=observed.some(({finding:f,reference})=>f.ruleId===rule&&f.contexts.includes(use.context)&&reference?.api===api&&reference.source?.file.path===use.node.file.path);
    if(alreadyReported)continue;
    diagnostics.finding(rule,binding.declaration,use.context,[...use.trace,{kind:'api',location:location(binding.declaration),symbol:api}],api,rule==='NSG001'?'client':'rsc');
  }
}
