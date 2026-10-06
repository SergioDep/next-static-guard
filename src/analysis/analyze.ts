import { GuardError } from '../cli/errors.js';
import { performance } from 'node:perf_hooks';
import type { Policy, ProjectSnapshot, Report, RuleId, RuleState, Limit } from '../types.js';
import { RULE_IDS } from '../types.js';
import { effectiveRules, applyBlocking, SHIPPED_CERTIFICATION } from '../rules/certification.js';
import type { Certification } from '../rules/certification.js';
import { discover } from '../project/discover.js';
import { Resolver } from '../project/resolve.js';
import { buildGraph } from '../graph/build.js';
import { Diagnostics } from '../rules/shared.js';
import { execute } from './phases.js';
import { checkRetainedApiImports } from '../rules/imports.js';
import { dataHooks } from './sensitivity.js';
import { orderedLimits, preferEvidence } from '../report/order.js';
import { canonical, policyHash } from '../report/fingerprint.js';
import { INTERNAL_EXCLUSIONS } from '../project/snapshot.js';
export const TOOL_VERSION='0.1.0-beta.1';
export const RULESET_VERSION='1.1.0';
export { SHIPPED_CERTIFICATION as CERTIFICATION } from '../rules/certification.js';
export function summarize(report:Report):void {
 report.summary={total:report.findings.length,new:0,existing:0,aggravated:0,unverified:0,suppressed:0,blocking:0,resolved:report.summary.resolved};
 for(const f of report.findings){report.summary[f.status]++;if(f.suppressed)report.summary.suppressed++;if(f.blocking)report.summary.blocking++;}
}
export function analyze(snapshot:ProjectSnapshot,policy:Policy,certification:Record<RuleId,Certification>=SHIPPED_CERTIFICATION):Report {
 const start=performance.now(),discovery=discover(snapshot,policy);
 const findings:Report['findings']=[],limits:Limit[]=[...snapshot.limits],reached=new Map<string,number>();let edges=0;
 for(const app of discovery.apps) {
  const graph=buildGraph(new Resolver(snapshot,app,policy)),diagnostics=new Diagnostics(graph,policy);
  execute(graph,diagnostics,dataHooks(graph,diagnostics));
  checkRetainedApiImports(graph,diagnostics);
  findings.push(...diagnostics.findings);limits.push(...graph.limits,...diagnostics.limits);edges+=graph.edgeCount;
  for(const use of graph.uses)reached.set(use.node.file.path,use.node.file.bytes);
 }
 const hash=policyHash(policy),rules=effectiveRules(policy,certification,discovery.apps.map(a=>a.versions));
 for(const f of findings) {
  const exception=policy.exceptions.find(e=>e.ruleId===f.ruleId&&e.fingerprint===f.fingerprint);
  if(exception){f.suppressed=true;f.suppressionStatus=exception.status;}
 }
 const uniqueFindings=new Map<string,Report['findings'][number]>();
 for(const f of findings){const prev=uniqueFindings.get(f.fingerprint);if(prev){prev.contexts=[...new Set([...prev.contexts,...f.contexts])].sort();if(preferEvidence(f.evidence,prev.evidence))prev.evidence=f.evidence;}else uniqueFindings.set(f.fingerprint,f);}
 const uniqueLimits=orderedLimits(limits);
 const report:Report={schemaVersion:1,toolVersion:TOOL_VERSION,rulesetVersion:RULESET_VERSION,fingerprintVersion:1,policyHash:hash,policy:{source:'default',currentPolicyHash:hash,changedFields:[],ignoredCurrentConfig:false,effectiveRules:rules},projects:discovery.apps.map(a=>a.versions),scope:{roots:policy.projectRoots,exclusions:[...INTERNAL_EXCLUSIONS,...policy.exclude].sort(),unsupported:discovery.unsupported},sensitivityConfigured:!!(policy.sensitive.env.length||policy.sensitive.exports.length),coverage:{status:uniqueLimits.length?'partial':'complete',limits:uniqueLimits},comparison:{mode:'none',baseCommit:null,status:'not-applicable'},findings:[...uniqueFindings.values()].sort((a,b)=>a.location.file.localeCompare(b.location.file,'en')||a.location.start.offset-b.location.start.offset||a.ruleId.localeCompare(b.ruleId,'en')),summary:{total:0,new:0,existing:0,aggravated:0,unverified:0,suppressed:0,blocking:0,resolved:[]},metrics:{durationMs:performance.now()-start,sourceCount:reached.size,sourceBytes:[...reached.values()].reduce((a,b)=>a+b,0),edgeCount:edges}};
 applyBlocking(report);summarize(report);return report;
}
