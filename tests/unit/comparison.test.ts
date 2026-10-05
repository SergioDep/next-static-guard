import { test, expect } from 'vitest';
import { scan } from './helpers.js';
import { compare, verifyBaseline } from '../../src/cli/comparison.js';
import { summarize } from '../../src/analysis/analyze.js';
import { exitCode } from '../../src/rules/certification.js';
import type { Report, RuleId } from '../../src/types.js';

const files={'app/page.tsx':"'use client';export default function Page(){return <p>{window.location.href}</p>;}"};
function limitation(report:Report,rule:RuleId,snapshot:'base'|'current',code='unknown-phase' as Report['coverage']['limits'][number]['code']):void {
 report.coverage.status='partial';report.coverage.limits.push({code,location:null,affectedRules:[rule],snapshot,projectRoot:'.'});
}
function certifyForTest(report:Report):void {report.policy.effectiveRules.NSG003={requested:'error',effective:'error',certified:true};}
test('same debt remains nonblocking and severity/confidence aggravation can block',async()=>{
 const original=await scan(files);
 for(const change of ['none','severity','confidence'] as const) {
  const current=structuredClone(original),base=structuredClone(original);certifyForTest(current);
  if(change==='severity')base.findings[0]!.severity='medium';
  if(change==='confidence')base.findings[0]!.confidence='medium';
  compare(current,base,'baseline',null);
  expect(current.findings[0]?.status).toBe(change==='none'?'existing':'aggravated');expect(exitCode(current,false)).toBe(change==='none'?0:1);
 }
});
test('complete absence resolves a finding and its later reappearance is new',async()=>{
 const debt=await scan(files),fixed=await scan({'app/page.tsx':"'use client';export default function Page(){return <p/>;}"});
 compare(fixed,debt,'baseline',null);expect(fixed.summary.resolved).toEqual([debt.findings[0]!.fingerprint]);
 const returned=await scan(files);compare(returned,fixed,'baseline',null);expect(returned.findings[0]?.status).toBe('new');
});
test('base coverage distinguishes preexisting paths from known new source paths',async()=>{
 const original=await scan(files),base=structuredClone(original);base.findings=[];summarize(base);limitation(base,'NSG003','base');
 const oldPath=structuredClone(original);certifyForTest(oldPath);compare(oldPath,base,'git','a'.repeat(40),new Set(['app/page.tsx']));
 expect(oldPath.findings[0]?.status).toBe('unverified');expect(oldPath.summary.blocking).toBe(0);expect(exitCode(oldPath,true)).toBe(2);
 const newPath=structuredClone(original);compare(newPath,base,'git','a'.repeat(40),new Set());expect(newPath.findings[0]?.status).toBe('new');expect(newPath.comparison.status).toBe('partial');
});
test('an unsupported base app cannot establish novelty even for a new path',async()=>{
 const current=await scan(files),base=await scan({'package.json':JSON.stringify({dependencies:{next:'15.0.0',react:'19.3.0','react-dom':'19.3.0'}}),'app/page.tsx':'export default function Page(){return <p/>;}'});
 compare(current,base,'git','a'.repeat(40),new Set());expect(current.findings[0]?.status).toBe('unverified');expect(current.summary.blocking).toBe(0);
});
test('current loss of relevant coverage prevents resolution, while unrelated limits do not',async()=>{
 const original=await scan(files),clean=await scan({'app/page.tsx':'export default function Page(){return <p/>;}'});
 for(const rule of ['NSG003','NSG005'] as const) {
  const current=structuredClone(clean);limitation(current,rule,'current');compare(current,original,'baseline',null);
  expect(current.summary.resolved).toEqual(rule==='NSG003'?[]:[original.findings[0]!.fingerprint]);
 }
});
test('fingerprint collisions remain unverified even with a matching base finding',async()=>{
 const current=await scan(files),base=structuredClone(current);certifyForTest(current);
 current.coverage.status='partial';current.coverage.limits.push({code:'fingerprint-collision',location:current.findings[0]!.location,affectedRules:['NSG003'],snapshot:'current',projectRoot:'.'});
 compare(current,base,'baseline',null);expect(current.findings[0]?.status).toBe('unverified');expect(current.summary.blocking).toBe(0);
});
test('baseline compatibility rejects policy, identity, scope, and incomplete evidence changes',async()=>{
 const current=await scan(files);verifyBaseline(current,current);
 const newer=structuredClone(current);newer.toolVersion='0.1.0-dev.1';verifyBaseline(current,newer);
 const changes:((base:Report)=>void)[]=[b=>{b.rulesetVersion='other';},b=>{b.policyHash='f'.repeat(64);},b=>{b.scope.roots=['another'];},b=>{b.scope.exclusions.push('another');},b=>limitation(b,'NSG003','base'),b=>{b.comparison={mode:'baseline',baseCommit:null,status:'partial'};}];
 for(const change of changes){const baseline=structuredClone(current);change(baseline);expect(()=>verifyBaseline(current,baseline)).toThrow();}
});
test('explicit exceptions suppress without exporting reasons or accepting saved-report suppression',async()=>{
 const original=await scan(files),fingerprint=original.findings[0]!.fingerprint;
 const suppressed=await scan(files,{schemaVersion:1,exceptions:[{ruleId:'NSG003',fingerprint,status:'accepted-risk',reason:'FICTIONAL_REASON_SENTINEL'}]});
 expect(suppressed.findings[0]?.suppressed).toBe(true);expect(suppressed.summary.suppressed).toBe(1);expect(JSON.stringify(suppressed)).not.toContain('FICTIONAL_REASON_SENTINEL');
 const current=structuredClone(original);compare(current,suppressed,'baseline',null);expect(current.findings[0]?.suppressed).toBe(false);expect(current.findings[0]?.status).toBe('existing');
});
