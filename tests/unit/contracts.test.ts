import { describe, test, expect } from 'vitest';
import { normalizePolicy, validateSchema } from '../../src/cli/config.js';
import { policyHash, canonical } from '../../src/report/fingerprint.js';
import { scan } from './helpers.js';
import { verifyReport } from '../../src/report/json.js';
describe('contracts',()=>{
 test('normalizes defaults without accepting unknown fields',()=>{
  expect(normalizePolicy().projectRoots).toEqual(['.']);
  expect(()=>normalizePolicy({schemaVersion:1,plugin:'evil'})).toThrow();
  for(const path of ['../escape','/escape','a//b','a/./b','C:/escape','!foo'])expect(()=>normalizePolicy({schemaVersion:1,exclude:[path]})).toThrow();
 });
 test('deduplicates sensitivity and rejects conflicting categories',()=>{
  const env=[{name:'TOKEN',category:'secret'},{name:'TOKEN',category:'secret'}];expect(normalizePolicy({schemaVersion:1,sensitive:{env}}).sensitive.env).toHaveLength(1);
  expect(()=>normalizePolicy({schemaVersion:1,sensitive:{env:[...env,{name:'TOKEN',category:'private'}]}})).toThrow();
 });
 test('hashes ignore exception reasons, retain status, and normalize ordering',()=>{
  const a=normalizePolicy({schemaVersion:1,exceptions:[{ruleId:'NSG001',fingerprint:'a'.repeat(64),status:'accepted-risk',reason:'one'}]});
  const b=normalizePolicy({...a,exceptions:[{...a.exceptions[0],reason:'two'}]});expect(policyHash(a)).toBe(policyHash(b));
  expect(canonical({z:1,a:{b:2,a:1}})).toBe('{"a":{"a":1,"b":2},"z":1}');
 });
 test('report passes the closed schema and invariants',async()=>{
  const report=await scan({'app/page.tsx':'export default function Page() { return <p>Valid</p>; }'});expect(report.coverage.status).toBe('complete');verifyReport(report);
  expect(()=>validateSchema('report',{...report,extra:true})).toThrow();
 });
});
test('isolated certification enables blocking, while debt and suppressions do not block',async()=>{
 const {SHIPPED_CERTIFICATION,applyBlocking,exitCode}=await import('../../src/rules/certification.js');
 const {summarize}=await import('../../src/analysis/analyze.js');
 const report=await scan({'app/page.tsx':"'use client';import 'server-only';export default function Page(){return <p/>;}"});
 expect(Object.values(SHIPPED_CERTIFICATION).every(c=>!c.eligible)).toBe(true);
 report.policy.effectiveRules.NSG001={requested:'error',effective:'error',certified:true};applyBlocking(report);summarize(report);expect(exitCode(report,false)).toBe(1);
 report.findings[0]!.status='existing';applyBlocking(report);summarize(report);expect(exitCode(report,false)).toBe(0);
 report.findings[0]!.status='aggravated';report.findings[0]!.suppressed=true;report.findings[0]!.suppressionStatus='accepted-risk';applyBlocking(report);summarize(report);expect(exitCode(report,false)).toBe(0);
});

test.each(['NSG001','NSG002','NSG003','NSG004','NSG005','NSG006'] as const)('an uncertified %s error request cannot enable blocking',async rule=>{
 const {effectiveRules}=await import('../../src/rules/certification.js');
 const policy=normalizePolicy({schemaVersion:1,rules:{[rule]:'error'}});
 expect(effectiveRules(policy)[rule]).toEqual({requested:'error',effective:'warn',certified:false});
});
test('certification is disabled outside its evaluated framework profile',async()=>{
 const {effectiveRules,SHIPPED_CERTIFICATION}=await import('../../src/rules/certification.js');
 const rules=structuredClone(SHIPPED_CERTIFICATION);rules.NSG001.eligible=true;
 const policy=normalizePolicy({schemaVersion:1,rules:{NSG001:'error'}});
 expect(effectiveRules(policy,rules,[{root:'.',nextVersion:'15.0.0',reactVersion:'19.3.0',reactDomVersion:'19.3.0',typescriptVersion:'6.0.3'}]).NSG001.effective).toBe('warn');
 expect(effectiveRules(policy,rules,[{root:'.',nextVersion:'16.3.8',reactVersion:'19.3.0',reactDomVersion:'19.3.0',typescriptVersion:'6.0.3'}]).NSG001.effective).toBe('error');
});
