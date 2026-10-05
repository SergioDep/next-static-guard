import type ts from 'typescript';
import type { Context, Evidence, Finding, Limit, LimitCode, Policy, RuleId, Severity } from '../types.js';
import type { Graph } from '../graph/build.js';
import { RULE_IDS } from '../types.js';
import { location } from '../project/location.js';
import { fingerprint } from '../report/fingerprint.js';
import { preferEvidence } from '../report/order.js';
const TEXT:Record<RuleId,{message:string;recommendation:string}>={
 NSG001:{message:'Client code reaches a server-only dependency or API.',recommendation:'Keep server access in a server module and pass a DTO or a valid Server Function reference to the client.'},
 NSG002:{message:'Server Component execution reaches a client-only dependency or hook.',recommendation:'Move the interactive behavior into a small Client Component.'},
 NSG003:{message:'A browser global is read during confirmed server execution.',recommendation:'Move the read into a client effect or event, or protect it with a dominating typeof window guard.'},
 NSG004:{message:'A server-created value is unsupported as a Client Component prop.',recommendation:'Pass React-supported data, create the handler on the client, or pass a valid Server Function reference.'},
 NSG005:{message:'Declared confidential data reaches a client publication sink.',recommendation:'Remove the confidential field from the DTO and keep its use on the server; review any previous exposure.'},
 NSG006:{message:'Client code reads an environment key without recognized public substitution.',recommendation:'Read the key on the server and pass only appropriate public data to the client.'}
};
export class Diagnostics {
 readonly findings:Finding[]=[];
 readonly limits:Limit[]=[];
 private identities=new Map<string,{tuple:string;finding:Finding}>();
 constructor(readonly graph:Graph,readonly policy:Policy) {}
 limit(code:LimitCode,node:ts.Node|null,rules:RuleId[]=[...RULE_IDS]):void {this.limits.push({code,location:node?location(node):null,affectedRules:[...new Set(rules)].sort(),snapshot:this.graph.resolver.snapshot.kind,projectRoot:this.graph.resolver.app.root});}
 finding(rule:RuleId,node:ts.Node,context:Context,trace:Evidence[],origin:string,destination:string,severity:Severity='high',confidence:'high'|'medium'='high'):void {
   if(this.policy.rules[rule]==='off')return;
   const id=fingerprint(rule,node.getSourceFile().fileName,node,origin,destination),previous=this.identities.get(id.hash);
   if(previous && previous.tuple!==id.tuple){this.limit('fingerprint-collision',node,[rule]);previous.finding.status='unverified';return;}
   if(previous){previous.finding.contexts=[...new Set([...previous.finding.contexts,context])].sort();if(preferEvidence(trace,previous.finding.evidence))previous.finding.evidence=trace;return;}
   const text=rule==='NSG005'&&destination.startsWith('config#env.')?{message:'A declared confidential key is configured for public environment substitution.',recommendation:'Remove the key from next.config.env and keep its use on the server; review any previous exposure.'}:TEXT[rule];
   const finding:Finding={ruleId:rule,...text,severity,confidence,location:location(node),contexts:[context],evidence:trace,fingerprint:id.hash,status:'new',suppressed:false,suppressionStatus:null,blocking:false};
   this.findings.push(finding);this.identities.set(id.hash,{tuple:id.tuple,finding});
 }
}
