import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { scan } from './helpers.js';
type Case={id:string;rule:string;expected:'finding'|'clean';sensitive?:unknown};
const fixtureData=createRequire(import.meta.url)('../quality/development-v1.mjs') as {cases:Case[];originalSources:(c:Case)=>Record<string,string>};

// The first reserved sample exposed three misses and is now development data.
test.each(fixtureData.cases)('development quality regression $id',async c=>{
 const report=await scan(fixtureData.originalSources(c),{schemaVersion:1,...c.sensitive?{sensitive:c.sensitive}:{}});
 expect(report.coverage.status).toBe('complete');
 if(c.expected==='clean')expect(report.findings).toEqual([]);
 else {expect(report.findings.some(f=>f.ruleId===c.rule)).toBe(true);expect(report.findings.every(f=>f.ruleId===c.rule)).toBe(true);}
});
