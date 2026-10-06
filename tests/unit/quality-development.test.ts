import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { scan } from './helpers.js';
type Case={id:string;rule:string;expected:'finding'|'clean';sensitive?:unknown};
const require=createRequire(import.meta.url);
const fixtureData=require('../quality/development-v1.mjs') as {cases:Case[];originalSources:(c:Case)=>Record<string,string>};

const second=require('../quality/development-v2.mjs') as typeof fixtureData;

// Cases used to tune the engine remain development regressions.
test.each([...fixtureData.cases,...second.cases])('development quality regression $id',async c=>{
 const report=await scan(fixtureData.originalSources(c),{schemaVersion:1,...c.sensitive?{sensitive:c.sensitive}:{}});
 expect(report.coverage.status).toBe('complete');
 if(c.expected==='clean')expect(report.findings).toEqual([]);
 else {expect(report.findings.some(f=>f.ruleId===c.rule)).toBe(true);expect(report.findings.every(f=>f.ruleId===c.rule)).toBe(true);}
});
