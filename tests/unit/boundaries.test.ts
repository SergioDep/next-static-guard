import { describe, test, expect } from 'vitest';
import { scan } from './helpers.js';
const client="'use client';\nexport default function Client(props: any) {return <p>Client</p>;}";
describe('server/client boundaries',()=>{
 test('explains client → helper → server-only',async()=>{
  const report=await scan({'app/page.tsx':"'use client';\nimport { data } from '../lib/helper';\nexport default function Page() {return <p>{data}</p>;}",'lib/helper.ts':"export { data } from './data';",'lib/data.ts':"import 'server-only';\nexport const data = 1;"});
  expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(report.findings[0]?.location.file).toBe('app/page.tsx');expect(report.findings[0]?.evidence.map(e=>e.symbol)).toEqual(['../lib/helper','./data','server-only']);
 });
 test('type imports do not propagate execution',async()=>{
  const report=await scan({'app/page.tsx':"'use client';\nimport type { Data } from '../lib/data';\nexport default function Page() {const data: Data = {label:'ok'};return <p>{data.label}</p>;}",'lib/data.ts':"import 'server-only';\nexport type Data = {label: string};"});expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
 });
 test('Server Function references preserve their server implementation',async()=>{
  const report=await scan({'app/page.tsx':"'use client';\nimport { action } from './actions';\nexport default function Page(){return <button onClick={() => action()}>Run</button>;}",'app/actions.ts':"'use server';\nimport { data } from '../lib/data';\nexport async function action(){return data;}",'lib/data.ts':"import 'server-only';\nexport const data = 'ok';"});expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
 });
 test('detects actual aliased API calls without prohibiting an unrelated Next import',async()=>{
  const report=await scan({'app/page.tsx':"'use client';\nimport { headers as getHeaders } from 'next/headers';\nexport default function Page(){getHeaders();return <p />;}"});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);
 });
 test('rejects actual client hooks in RSC and accepts a same-named local function',async()=>{
  const bad=await scan({'app/page.tsx':"import { useState as state } from 'react';\nexport default function Page(){state(0);return <p />;}"});expect(bad.findings.map(f=>f.ruleId)).toEqual(['NSG002']);
  const good=await scan({'app/page.tsx':"function useRouter(){return 'local';}\nexport default function Page(){return <p>{useRouter()}</p>;}"});expect(good.findings).toEqual([]);
 });
 test('does not execute imported function bodies just because they are imported',async()=>{
  const report=await scan({'app/page.tsx':"import { unused } from '../lib/helper';\nexport default function Page(){return <p />;}",'lib/helper.ts':"export function unused(){ return window.location.href; }"});expect(report.findings).toEqual([]);
 });
 test('finds SSR globals but accepts effects, events, guards, and shadowing',async()=>{
  const bad=await scan({'app/page.tsx':"'use client';\nimport { useMemo } from 'react';\nexport default function Page(){const href=useMemo(()=>window.location.href,[]);return <p>{href}</p>;}"});expect(bad.findings.map(f=>f.ruleId)).toEqual(['NSG003']);
  for(const body of ["useEffect(()=>{window.location.href;},[]);", "const window={location:{href:'local'}};window.location.href;", "if(typeof window !== 'undefined'){window.location.href;}", "if(typeof window === 'undefined')return <p />;window.location.href;"]) {
   const good=await scan({'app/page.tsx':"'use client';\nimport { useEffect } from 'react';\nexport default function Page(){"+body+"return <button onClick={()=>document.title}>ok</button>;}"});expect(good.findings).toEqual([]);expect(good.coverage.status).toBe('complete');
  }
 });
 test('checks nonserializable props and accepts valid remote references and builtins',async()=>{
  const bad=await scan({'app/page.tsx':"import Client from './client';\nexport default function Page(){return <Client handler={()=>1}/>;}",'app/client.tsx':client});expect(bad.findings.map(f=>f.ruleId)).toEqual(['NSG004']);
  const good=await scan({'app/page.tsx':"import Client from './client';\nexport default function Page(){async function action(){'use server';return 1;}return <Client handler={action} date={new Date()} map={new Map([['a',1]])} symbol={Symbol.for('shared')}/>;}",'app/client.tsx':client});expect(good.findings).toEqual([]);expect(good.coverage.status).toBe('complete');
 });
 test('declared secret prop has no confidential literal in reports',async()=>{
  const sentinel='FICTIONAL_DO_NOT_EMIT_7e3f';
  const report=await scan({'app/page.tsx':"import Client from './client';\nimport { profile } from '../lib/profile';\nexport default function Page(){const dto={email:profile.email};return <Client dto={dto}/>;}",'app/client.tsx':client,'lib/profile.ts':`export const profile={email:'${sentinel}',name:'Allowed'};`},{schemaVersion:1,sensitive:{exports:[{file:'lib/profile.ts',export:'profile',field:['email'],category:'private'}]}});
  expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);expect(JSON.stringify(report)).not.toContain(sentinel);
 });
 test('private client env is a functional warning, not a secret leak',async()=>{
  const report=await scan({'app/page.tsx':"'use client';\nexport default function Page(){return <p>{process.env.TOKEN}</p>; }"},{schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG006']);expect(report.findings[0]?.blocking).toBe(false);
 });
 test('dynamic env access and unsupported versions produce limitations',async()=>{
  const dynamic=await scan({'app/page.tsx':"'use client';\nexport default function Page(){const key='TOKEN';return <p>{process.env[key]}</p>;}"});expect(dynamic.findings).toEqual([]);expect(dynamic.coverage.limits.some(l=>l.code==='unknown-value')).toBe(true);
  const unsupported=await scan({'package.json':JSON.stringify({dependencies:{next:'15.0.0',react:'19.3.0','react-dom':'19.3.0'}}),'app/page.tsx':"export default function Page(){return <p>{window.location.href}</p>;}"});expect(unsupported.findings).toEqual([]);expect(unsupported.coverage.limits[0]?.code).toBe('unsupported-version');
 });
 test('fingerprint survives leading whitespace and literal changes',async()=>{
  const files={'app/page.tsx':"'use client';\nexport default function Page(){return <p>{process.env.TOKEN || 'fallback'}</p>;}"};const a=await scan(files),b=await scan({'app/page.tsx':'\n\n'+files['app/page.tsx'].replace("'fallback'","'changed'")});expect(a.findings[0]?.fingerprint).toBe(b.findings[0]?.fingerprint);
 });
});

test('star barrels retain marker restrictions independently of selected value exports',async()=>{
 const files={'app/page.tsx':"'use client';import { label } from '../lib/barrel';export default function Page(){return <p>{label}</p>;}",'lib/barrel.ts':"export * from './secret';export * from './pure';",'lib/secret.ts':"import 'server-only';export const confidential='hidden';",'lib/pure.ts':"export const label='safe';"};
 const good=await scan(files);expect(good.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(good.coverage.status).toBe('complete');
 const bad=await scan({...files,'app/page.tsx':files['app/page.tsx'].replaceAll('label','confidential')});expect(bad.findings.map(f=>f.ruleId)).toEqual(['NSG001']);
 const hook=await scan({'app/page.tsx':"import { router } from '../lib/barrel';export default function Page(){router();return <p/>;}",'lib/barrel.ts':"export * from './pure';export * from './router';",'lib/pure.ts':"export const label='safe';",'lib/router.ts':"export {useRouter as router} from 'next/navigation';"});expect(hook.findings.map(f=>f.ruleId)).toEqual(['NSG002']);
});
test('star reexports do not forward default exports and unknown retention is partial',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import { value } from '../lib/barrel';export default function Page(){return <p>{value}</p>;}",'lib/barrel.ts':"export * from 'unknown-library';export {value} from './pure';",'lib/pure.ts':"export const value='safe';"});
 expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='uncertain-runtime')).toBe(true);
});
test('reassigned function aliases invalidate calls while retaining framework import restrictions',async()=>{
 const hook=await scan({'app/page.tsx':"import {useState} from 'react';let state=useState;state=()=>0;export default function Page(){state();return <p/>;}"});
 expect(hook.findings.map(f=>f.ruleId)).toEqual(['NSG002']);expect(hook.findings[0]?.location.start.offset).toBe(0);expect(hook.coverage.limits.some(l=>l.code==='unknown-phase')).toBe(true);
 const browser=await scan({'app/page.tsx':"'use client';function original(){return window.location.href;}let callback=original;callback=()=>'';export default function Page(){return <p>{callback()}</p>;}"});
 expect(browser.findings).toEqual([]);expect(browser.coverage.limits.some(l=>l.code==='unknown-phase')).toBe(true);
 const stable=await scan({'app/page.tsx':"'use client';function original(){return window.location.href;}let callback=original;export default function Page(){return <p>{callback()}</p>;}"});
 expect(stable.findings.map(f=>f.ruleId)).toEqual(['NSG003']);
});
test('async variable and local alias Server Function exports are recognized and their returns inspected',async()=>{
 for(const action of ["'use server';export const action=async()=>process.env.TOKEN;", "'use server';async function run(){return process.env.TOKEN;}export {run as action};"]) {
  const report=await scan({'app/page.tsx':"'use client';import {action} from './actions';export default function Page(){return <button onClick={()=>action()}>Run</button>;}",'app/actions.ts':action},{schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}});
  expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);expect(report.coverage.status).toBe('complete');
 }
});
test('import elision respects shadowing and the consuming app preservation policy',async()=>{
 for(const body of ["function local(data:string){return data;}","function local(){let data='local';return data;}","function local(){if(true){var data='local';}return data;}"]) {
  const report=await scan({'app/page.tsx':"'use client';import {data} from '../lib/server';"+body+"export default function Page(){return <p>{local('local')}</p>;}",'lib/server.ts':"import 'server-only';export const data='server';"});
  expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
  const preserved=await scan({'tsconfig.json':JSON.stringify({compilerOptions:{verbatimModuleSyntax:true}}),'app/page.tsx':"'use client';import {data} from '../lib/server';"+body+"export default function Page(){return <p>{local('local')}</p>;}",'lib/server.ts':"import 'server-only';export const data='server';"});expect(preserved.findings.map(f=>f.ruleId)).toEqual(['NSG001']);
 }
});
test('an imported value reexported through a local export remains a runtime dependency',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import {data} from '../lib/barrel';export default function Page(){return <p>{data}</p>;}",'lib/barrel.ts':"import {data} from './server';export {data};",'lib/server.ts':"import 'server-only';export const data='server';"});
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(report.coverage.status).toBe('complete');
});
test('local imported API reexports preserve the actual hook symbol',async()=>{
 const report=await scan({'app/page.tsx':"import {router} from '../lib/barrel';export default function Page(){router();return <p/>;}",'lib/barrel.ts':"import {useRouter as router} from 'next/navigation';export {router};"});
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG002']);
});
test('retained imports are checked even when their exported API wrapper is not called',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import {label} from '../lib/barrel';export default function Page(){return <p>{label}</p>;}",'lib/barrel.ts':"export * from './unused';export * from './pure';",'lib/unused.ts':"import {headers} from 'next/headers';export async function serverRead(){return headers();}",'lib/pure.ts':"export const label='safe';"});
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(report.findings[0]?.location.file).toBe('lib/unused.ts');expect(report.coverage.status).toBe('complete');
});
test('verbatim imports preserve an implicit type dependency while explicit type imports erase it',async()=>{
 const files={'tsconfig.json':JSON.stringify({compilerOptions:{verbatimModuleSyntax:true}}),'app/page.tsx':"'use client';import {Data} from '../lib/secret';export default function Page(){const data:Data={label:'safe'};return <p>{data.label}</p>;}",'lib/secret.ts':"import 'server-only';export interface Data{label:string}"};
 expect((await scan(files)).findings.map(f=>f.ruleId)).toEqual(['NSG001']);
 const clean=await scan({...files,'app/page.tsx':files['app/page.tsx'].replace('import {Data}','import type {Data}')});expect(clean.findings).toEqual([]);expect(clean.coverage.status).toBe('complete');
 const elided=await scan({...files,'tsconfig.json':JSON.stringify({compilerOptions:{verbatimModuleSyntax:false}})});expect(elided.findings).toEqual([]);expect(elided.coverage.status).toBe('complete');
});
test('resolved object methods retain render and effect phases and invalidate mutations',async()=>{
 for(const object of ["{read(){return window.location.href;}}","{read:()=>window.location.href}"]) {
  const prefix="'use client';import {useEffect} from 'react';const helpers="+object+';';
  const bad=await scan({'app/page.tsx':prefix+"export default function Page(){return <p>{helpers.read()}</p>;}"});expect(bad.findings.map(f=>f.ruleId)).toEqual(['NSG003']);
  const good=await scan({'app/page.tsx':prefix+"export default function Page(){useEffect(()=>{helpers.read();},[]);return <p/>;}"});expect(good.findings).toEqual([]);expect(good.coverage.status).toBe('complete');
  const changed=await scan({'app/page.tsx':prefix+"helpers.read=()=>'';export default function Page(){return <p>{helpers.read()}</p>;}"});expect(changed.findings).toEqual([]);expect(changed.coverage.limits.some(l=>l.code==='unknown-phase')).toBe(true);
 }
 const imported=await scan({'app/page.tsx':"'use client';import helpers from '../lib/helpers';export default function Page(){return <p>{helpers['read']()}</p>;}",'lib/helpers.ts':"export default {read(){return window.location.href;}};"});expect(imported.findings.map(f=>f.ruleId)).toEqual(['NSG003']);
});
