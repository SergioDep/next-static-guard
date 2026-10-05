import { RULE_IDS } from '../types.js';
import type { RuleId, RuleLevel, RuleState, Policy, Report, ProjectVersions } from '../types.js';
export interface Certification {profile:{next:string;react:string;reactDom:string};eligible:boolean;defaultLevel:RuleLevel;results:string|null}
export const SHIPPED_CERTIFICATION=Object.fromEntries(RULE_IDS.map(r=>[r,{profile:{next:'16.3.8',react:'19.3.0',reactDom:'19.3.0'},eligible:false,defaultLevel:'warn',results:null}])) as Record<RuleId,Certification>;
export function effectiveRules(policy:Policy,certification=SHIPPED_CERTIFICATION,projects?:ProjectVersions[]):Record<RuleId,RuleState> {
 return Object.fromEntries(RULE_IDS.map(rule=>{const requested=policy.rules[rule],entry=certification[rule],eligible=entry.eligible&&(!projects||projects.length>0&&projects.every(p=>p.nextVersion===entry.profile.next&&p.reactVersion===entry.profile.react&&p.reactDomVersion===entry.profile.reactDom));return [rule,{requested,effective:requested==='off'?'off':requested==='error'&&eligible&&rule!=='NSG006'?'error':'warn',certified:eligible&&rule!=='NSG006'}];})) as Record<RuleId,RuleState>;
}
export function applyBlocking(report:Report):void {
 for(const finding of report.findings)finding.blocking=!finding.suppressed&&['new','aggravated'].includes(finding.status)&&finding.confidence==='high'&&['high','critical'].includes(finding.severity)&&report.policy.effectiveRules[finding.ruleId].effective==='error';
}
export function exitCode(report:Report,strict:boolean):number{return strict&&(report.coverage.status==='partial'||report.comparison.status==='partial')?2:report.summary.blocking?1:0;}
