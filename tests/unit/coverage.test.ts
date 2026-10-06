import { test, expect } from 'vitest';
import { scan, fixture, manifest } from './helpers.js';
import { normalizePolicy } from '../../src/cli/config.js';
import { materializeSources, filesystemSnapshot, inside } from '../../src/project/snapshot.js';
import { analyze } from '../../src/analysis/analyze.js';
import type { ProjectSnapshot, SnapshotFile } from '../../src/types.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('effect arguments run during rendering and shared helpers retain both phases',async()=>{
 const prefix="'use client';import {useEffect} from 'react';function read(){return window.location.href;}";
 const effect=await scan({'app/page.tsx':prefix+'export default function Page(){useEffect(()=>{read();},[]);return <p/>;}'});expect(effect.findings).toEqual([]);
 const both=await scan({'app/page.tsx':prefix+'export default function Page(){useEffect(()=>{read();},[]);return <p>{read()}</p>;}'});expect(both.findings.map(f=>f.ruleId)).toEqual(['NSG003']);
 const args=await scan({'app/page.tsx':prefix+'export default function Page(){useEffect(()=>{},[window.location.href]);return <p/>;}'});expect(args.findings.map(f=>f.ruleId)).toEqual(['NSG003']);
});
test('known app aliases, baseUrl, local exports, and transpiled workspace sources resolve consistently',async()=>{
 const report=await scan({'package.json':JSON.stringify({...manifest,workspaces:['packages/*']}),'app/page.tsx':"'use client';import {label} from 'value';import {data} from '@lab/data/public';export default function Page(){return <p>{label}{data}</p>;}",'tsconfig.json':JSON.stringify({compilerOptions:{baseUrl:'lib'}}),'lib/value.ts':"export const label='safe';",'packages/data/package.json':JSON.stringify({name:'@lab/data',type:'module',exports:{'./public':'./src/public.ts'}}),'packages/data/src/public.ts':"export const data='safe';",'next.config.mjs':"export default {transpilePackages:['@lab/data']};"});expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
 const missing=await scan({'package.json':JSON.stringify({...manifest,workspaces:['packages/*']}),'app/page.tsx':"'use client';import {data} from '@lab/data/private';export default function Page(){return <p>{data}</p>;}",'packages/data/package.json':JSON.stringify({name:'@lab/data',type:'module',exports:{'./public':'./src/public.ts'}}),'packages/data/src/private.ts':"export const data='safe';"});expect(missing.findings).toEqual([]);expect(missing.coverage.limits.some(l=>l.code==='unresolved-import')).toBe(true);
});
test('the same shared helper keeps the resolution of each consuming app',async()=>{
 const report=await scan({'package.json':JSON.stringify({...manifest,workspaces:['apps/*']}),'apps/a/package.json':JSON.stringify({...manifest,name:'a'}),'apps/b/package.json':JSON.stringify({...manifest,name:'b'}),'apps/a/app/page.tsx':"'use client';import {data} from '../../../shared/helper';export default function Page(){return <p>{data}</p>;}",'apps/b/app/page.tsx':"'use client';import {data} from '../../../shared/helper';export default function Page(){return <p>{data}</p>;}",'apps/a/tsconfig.json':JSON.stringify({compilerOptions:{paths:{'@data':['../../shared/safe.ts']}}}),'apps/b/tsconfig.json':JSON.stringify({compilerOptions:{paths:{'@data':['../../shared/restricted.ts']}}}),'shared/helper.ts':"export {data} from '@data';",'shared/safe.ts':"export const data='safe';",'shared/restricted.ts':"import 'server-only';export const data='restricted';"},{schemaVersion:1,projectRoots:['apps/a','apps/b']});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(report.findings[0]?.location.file).toBe('apps/b/app/page.tsx');expect(report.coverage.status).toBe('complete');
});
test('invalid source UTF-8 produces a limitation without reporting byte contents',async()=>{
 const project=await fixture({'app/page.tsx':"import {data} from '../lib/data';export default function Page(){return <p>{data}</p>;}",'lib/data.ts':"export const data='safe';"});
 try{await writeFile(join(project.root,'lib/data.ts'),Buffer.from([0xc3,0x28]));const policy=normalizePolicy(),report=analyze(await filesystemSnapshot(project.root,policy),policy);expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='unsupported-syntax'&&l.location?.file==='app/page.tsx'&&l.location.start.offset===0)).toBe(true);}finally{await project.close();}
});
test('total source byte budget rejects the crossing source before admitting it',async()=>{
 const policy=normalizePolicy(),files=new Map<string,SnapshotFile>(),inventory=new Set(['package.json','app/page.tsx']);
 files.set('package.json',{path:'package.json',text:JSON.stringify(manifest),bytes:200,hash:'a'.repeat(64)});
 for(let i=0;i<258;i++)inventory.add(`lib/m${i}.ts`);
 const snapshot:ProjectSnapshot={root:'/virtual-guardlab',files,inventory,aliases:new Map(),failures:new Map(),limits:[],versions:new Map(),kind:'current'};
 await materializeSources(snapshot,policy,async path=>{const index=/lib\/m(\d+)\.ts/.exec(path)?.[1];const text=index===undefined?"import {v} from '../lib/m0';export default function Page(){return v;}":`import {v as next} from './m${Number(index)+1}';export const v=next;`;files.set(path,{path,text,bytes:index===undefined?100:2*1024*1024,hash:'b'.repeat(64)});});
 expect([...files.values()].filter(f=>f.path!=='package.json').reduce((sum,f)=>sum+f.bytes,0)).toBeLessThanOrEqual(512*1024*1024);
 expect(snapshot.failures.get('lib/m255.ts')).toBe('source-budget');expect(files.has('lib/m255.ts')).toBe(false);expect(files.has('lib/m256.ts')).toBe(false);
});
test('a mismatched React DOM version disables the framework profile',async()=>{
 const report=await scan({'package.json':JSON.stringify({dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.2.0'}}),'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}"});
 expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('partial');expect(report.coverage.limits.some(limit=>limit.code==='unsupported-version')).toBe(true);
});

test('gitignore cannot hide a reached server dependency from a local scan',async()=>{
 const report=await scan({'.gitignore':'lib/\n','app/page.tsx':"'use client';import {value} from '../lib/private';export default function Page(){return <p>{value}</p>;}",'lib/private.ts':"import 'server-only';export const value=1;"});
 expect(report.findings.map(finding=>finding.ruleId)).toEqual(['NSG001']);expect(report.coverage.status).toBe('complete');
});

test('scan containment rejects parent and sibling paths',()=>{
 expect(inside(join(process.cwd(),'app'),join(process.cwd(),'app','page.tsx'))).toBe(true);
 expect(inside(join(process.cwd(),'app'),process.cwd())).toBe(false);
 expect(inside(join(process.cwd(),'app'),join(process.cwd(),'application','page.tsx'))).toBe(false);
});

test.runIf(process.platform==='win32')('scan containment rejects another Windows drive or UNC share',()=>{
 expect(inside('C:\\repo','C:\\repo\\app\\page.tsx')).toBe(true);
 expect(inside('C:\\repo','D:\\repo\\app\\page.tsx')).toBe(false);
 expect(inside('\\\\server\\one\\repo','\\\\server\\two\\repo')).toBe(false);
});
