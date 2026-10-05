import { GuardError } from './errors.js';
import type { Report } from '../types.js';
import { canonical } from '../report/fingerprint.js';
import { summarize } from '../analysis/analyze.js';
import { applyBlocking } from '../rules/certification.js';
import { verifyReport } from '../report/json.js';
import { orderedLimits } from '../report/order.js';
export function verifyBaseline(current:Report,baseline:Report):void {
 verifyReport(baseline);
 if(current.schemaVersion!==baseline.schemaVersion||current.rulesetVersion!==baseline.rulesetVersion||current.fingerprintVersion!==baseline.fingerprintVersion||current.policyHash!==baseline.policyHash||canonical(current.scope.roots)!==canonical(baseline.scope.roots)||canonical(current.scope.exclusions)!==canonical(baseline.scope.exclusions)||baseline.coverage.status!=='complete'||baseline.comparison.status==='partial')throw new GuardError('Incompatible baseline.');
}
export function compare(current:Report,base:Report,mode:'git'|'baseline',baseCommit:string|null,baseInventory?:ReadonlySet<string>):void {
 const currentLimits=[...current.coverage.limits];
 const affected=(limits:Report['coverage']['limits'],rule:string)=>limits.some(l=>l.affectedRules.includes(rule as Report['findings'][number]['ruleId']));
 const previous=new Map(base.findings.map(f=>[f.fingerprint,f])),ranks={info:0,medium:1,high:2,critical:3};
 const newAppMappingKnown=(file:string):boolean=>{
  const app=current.projects.filter(p=>p.root==='.'||file.startsWith(p.root+'/')).sort((a,b)=>b.root.length-a.root.length)[0];
  return !!app&&!base.coverage.limits.some(l=>l.code==='unsupported-version'&&(l.projectRoot===null||l.projectRoot===app.root));
 };
 for(const f of current.findings) {
  if(currentLimits.some(l=>l.code==='fingerprint-collision'&&l.affectedRules.includes(f.ruleId)&&l.location?.file===f.location.file&&l.location.start.offset===f.location.start.offset)){f.status='unverified';continue;}
  const old=previous.get(f.fingerprint);
  if(old)f.status=(ranks[f.severity]>ranks[old.severity]||(f.confidence==='high'&&old.confidence==='medium'))&&ranks[f.severity]>=2&&f.confidence==='high'?'aggravated':'existing';
  else f.status=!affected(base.coverage.limits,f.ruleId)||(baseInventory&&!baseInventory.has(f.location.file)&&newAppMappingKnown(f.location.file))?'new':'unverified';
 }
 current.comparison={mode,baseCommit,status:base.coverage.status==='complete'&&current.coverage.status==='complete'?'complete':'partial'};
 current.summary.resolved=[...new Set(base.findings.filter(f=>!affected(currentLimits,f.ruleId)&&!current.findings.some(n=>n.fingerprint===f.fingerprint)).map(f=>f.fingerprint))].sort();
 if(mode==='git')current.coverage.limits.push(...base.coverage.limits);
 if(current.coverage.limits.length)current.coverage.status='partial';
 if(current.findings.some(f=>f.status==='unverified')) {
  current.coverage.status='partial';current.coverage.limits.push({code:'comparison-incomplete',location:null,affectedRules:[...new Set(current.findings.filter(f=>f.status==='unverified').map(f=>f.ruleId))].sort(),snapshot:'base',projectRoot:null});
 }
 current.coverage.limits=orderedLimits(current.coverage.limits);
 applyBlocking(current);summarize(current);
}
