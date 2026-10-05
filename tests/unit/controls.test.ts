import { test, expect } from 'vitest';
import { scan } from './helpers.js';
const client="'use client';export default function Client(props:any){return <p/>;}";
const server=(body:string)=>"import Client from './client';export default function Page(){"+body+'}';
test('literal NodeNext substitutions and app configuration ownership',async()=>{
 for(const mode of ['bundler','nodenext','NodeNext']) {
  const report=await scan({'app/page.tsx':"'use client';import { data } from '../lib/data.js';export default function Page(){return <p>{data}</p>;}",'lib/data.js':"export const data='valid';",'lib/data.ts':"import 'server-only';export const data='invalid';",'tsconfig.json':JSON.stringify({compilerOptions:{moduleResolution:mode}}),'lib/tsconfig.json':JSON.stringify({compilerOptions:{moduleResolution:'bundler'}})});
  expect(report.findings.map(f=>f.ruleId)).toEqual(mode==='bundler'?[]:['NSG001']);
 }
 const unsupported=await scan({'app/page.tsx':"'use client';import { data } from '../lib/data.mjs';export default function Page(){return <p>{data}</p>;}",'lib/data.mjs':"export const data='valid';",'lib/data.mts':"export const data='unsupported';",'tsconfig.json':JSON.stringify({compilerOptions:{moduleResolution:'nodenext'}})});
 expect(unsupported.findings).toEqual([]);expect(unsupported.coverage.limits.some(l=>l.code==='unsupported-syntax')).toBe(true);
});
test('directive prologues accept use strict and reject parentheses, templates, and conflicts',async()=>{
 const valid=await scan({'app/page.tsx':"'use strict';'use client';import {useState} from 'react';export default function Page(){useState(0);return <p/>;}"});expect(valid.coverage.status).toBe('complete');expect(valid.findings).toEqual([]);
 for(const directive of ["('use client');","`use client`;","'use client';'use server';"]) {
  const invalid=await scan({'app/page.tsx':directive+'export default function Page(){return <p/>;}'});expect(invalid.findings).toEqual([]);expect(invalid.coverage.limits.some(l=>l.code==='unsupported-syntax')).toBe(true);
 }
});
test('error entries require a client directive',async()=>{
 const report=await scan({'app/page.tsx':'export default function Page(){return <p/>;}','app/error.tsx':'export default function Error(){return <p/>;}'});expect(report.coverage.limits.some(l=>l.code==='unsupported-syntax'&&l.location?.file==='app/error.tsx')).toBe(true);
});
test('fs/promises is restricted only when used in client execution',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import {readFile} from 'node:fs/promises';export default function Page(){readFile('fictional');return <p/>;}"});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);
});
test('overrides remove rejected values and children cross the prop boundary',async()=>{
 const good=await scan({'app/page.tsx':server('const props={data:()=>1};return <Client {...props} data={1}/>;'),'app/client.tsx':client});expect(good.findings).toEqual([]);expect(good.coverage.status).toBe('complete');
 const bad=await scan({'app/page.tsx':server("return <Client>{Symbol('local')}</Client>;"),'app/client.tsx':client});expect(bad.findings.map(f=>f.ruleId)).toEqual(['NSG004']);
});
test('client function references and encrypted captures are valid; explicit returns are checked',async()=>{
 const policy={schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}};
 const capture=await scan({'app/page.tsx':server("const token=process.env.TOKEN;async function action(){'use server';return 1;}return <Client action={action}/>;"),'app/client.tsx':client},policy);expect(capture.findings).toEqual([]);
 const leak=await scan({'app/page.tsx':server("async function action(){'use server';return process.env.TOKEN;}return <Client action={action}/>;"),'app/client.tsx':client},policy);expect(leak.findings.map(f=>f.ruleId)).toEqual(['NSG005']);
 const ref=await scan({'app/page.tsx':"import Client, {handler} from './client';export default function Page(){return <Client action={handler}/>;}",'app/client.tsx':"'use client';export function handler(){return 1;}export default function Client(props:any){return <p/>;}"});expect(ref.findings).toEqual([]);expect(ref.coverage.status).toBe('complete');
});
test('NODE_ENV is not private; dynamic keys, aliases, and destructuring are unknown',async()=>{
 const env=await scan({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.NODE_ENV}</p>;}"});expect(env.findings).toEqual([]);expect(env.coverage.status).toBe('complete');
 for(const body of ["const key='TOKEN';return <p>{process.env[key]}</p>;","const env=process.env;return <p>{env.TOKEN}</p>;","const {TOKEN}=process.env;return <p>{TOKEN}</p>;"]) {
  const report=await scan({'app/page.tsx':"'use client';export default function Page(){"+body+'}'});expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='unknown-value'&&l.affectedRules.includes('NSG006'))).toBe(true);
 }
});
test('public keys declared secret leak, and DTO selection removes fields',async()=>{
 const report=await scan({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.NEXT_PUBLIC_TOKEN}</p>;}"},{schemaVersion:1,sensitive:{env:[{name:'NEXT_PUBLIC_TOKEN',category:'secret'}]}});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);
});
test('literal next/dynamic ssr false prevents server execution only for that use',async()=>{
 const files={'app/page.tsx':"'use client';import dynamic from 'next/dynamic';const Widget=dynamic(()=>import('./widget'),{ssr:false});export default function Page(){return <Widget/>;}",'app/widget.tsx':"'use client';const title=window.location.href;export default function Widget(){return <p>{window.location.href}{title}</p>;}"};
 const browser=await scan(files);expect(browser.findings).toEqual([]);expect(browser.coverage.status).toBe('complete');
 const ssr=await scan({...files,'app/page.tsx':files['app/page.tsx'].replace('ssr:false','ssr:true')});expect(ssr.findings.filter(f=>f.ruleId==='NSG003')).toHaveLength(2);
});
test('JSON literal imports are serializable runtime data',async()=>{
 const report=await scan({'app/page.tsx':"import Client from './client';import data from '../lib/data.json';export default function Page(){return <Client data={data}/>;}",'app/client.tsx':client,'lib/data.json':'{"name":"Allowed","items":[1,2]}'});expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
});
test('tracks confidential data through local function parameters and server component props',async()=>{
 const policy={schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}};
 const report=await scan({'app/page.tsx':"import Client from './client';function dto(value:string|undefined){return {token:value};}function Panel({token}:{token:string|undefined}){return <Client data={dto(token)}/>;}export default function Page(){return <Panel token={process.env.TOKEN}/>;}",'app/client.tsx':client},policy);
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);expect(report.coverage.status).toBe('complete');
});
test('unreachable oversized sources do not reduce reviewed coverage',async()=>{
 const report=await scan({'app/page.tsx':'export default function Page(){return <p/>;}','unused/large.ts':' '.repeat(2*1024*1024+1)});expect(report.coverage.status).toBe('complete');expect(report.metrics.sourceCount).toBe(2);
});
test('a local window cannot establish a browser-global guard',async()=>{
 const report=await scan({'app/page.tsx':"'use client';export default function Page(){const window={};if(typeof window!=='undefined'){document.title;}return <p/>;}"});expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='unknown-phase')).toBe(true);
});
test('distinct calls preserve distinct parameter sensitivity',async()=>{
 const report=await scan({'app/page.tsx':"import Client from './client';function Panel({value}:{value:string|undefined}){return <Client data={value}/>;}export default function Page(){return <><Panel value={'Allowed'}/><Panel value={process.env.TOKEN}/></>;}",'app/client.tsx':client},{schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);expect(report.coverage.status).toBe('complete');
});
test('custom config path and relative extends are read as metadata',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import {data} from '@/data';export default function Page(){return <p>{data}</p>;}",'lib/data.ts':'export const data=1;','next.config.mjs':"export default {typescript:{tsconfigPath:'config/custom.json'}};",'config/custom.json':JSON.stringify({extends:'./parent.json'}),'config/parent.json':JSON.stringify({compilerOptions:{paths:{'@/*':['../lib/*']}}})});expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
});
test('BOM and CRLF offsets remain original UTF-16 source offsets',async()=>{
 const text="\uFEFF'use client';\r\nexport default function Page(){return <p>{window.location.href}</p>;}\r\n";
 const report=await scan({'app/page.tsx':text});expect(report.findings[0]?.location.start.offset).toBe(text.indexOf('window'));expect(report.findings[0]?.location.start.line).toBe(2);
});
test('mutated configuration cannot establish publication or a confidential leak',async()=>{
 const report=await scan({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}",'next.config.mjs':"const config={env:{TOKEN:'FICTIONAL_SENTINEL'}};delete config.env.TOKEN;export default config;"},{schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG006']);expect(report.findings[0]?.confidence).toBe('medium');expect(report.coverage.limits.some(l=>l.code==='dynamic-config')).toBe(true);expect(JSON.stringify(report)).not.toContain('FICTIONAL_SENTINEL');
});
test('older project TypeScript is informational rather than unsupported',async()=>{
 const report=await scan({'app/page.tsx':'export default function Page(){return <p/>;}','package.json':JSON.stringify({dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.3.0',typescript:'4.9.5'}})});expect(report.projects[0]?.typescriptVersion).toBe('4.9.5');expect(report.coverage.status).toBe('complete');
});
test('compound guards dominate browser reads and unsupported guards produce limitations',async()=>{
 for(const body of ["if(typeof window !== 'undefined' && true){document.title;}","if(typeof window === 'undefined' || false){}else{document.title;}","if(!(typeof window === 'undefined')){document.title;}","if(false){document.title;}"]) {
  const report=await scan({'app/page.tsx':"'use client';export default function Page(){"+body+'return <p/>;}'});expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
 }
 const unsupported=await scan({'app/page.tsx':"'use client';export default function Page(){if(typeof document!=='undefined'){document.title;}return <p/>;}"});expect(unsupported.findings).toEqual([]);expect(unsupported.coverage.limits.some(l=>l.code==='unknown-phase'&&l.affectedRules.includes('NSG003'))).toBe(true);
});
test('filesystem side-effect imports establish runtime restriction',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import 'node:fs/promises';export default function Page(){return <p/>;}"});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);
});
test('literal null prototypes reject serialization while config prototype setters are not public keys',async()=>{
 const bad=await scan({'app/page.tsx':server('return <Client data={{__proto__:null}}/>;'),'app/client.tsx':client});expect(bad.findings.map(f=>f.ruleId)).toEqual(['NSG004']);
 const env=await scan({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.__proto__}</p>;}",'next.config.mjs':"export default {env:{__proto__:'FICTIONAL_SENTINEL'}};"},{schemaVersion:1,sensitive:{env:[{name:'__proto__',category:'secret'}]}});expect(env.findings.map(f=>f.ruleId)).toEqual(['NSG006']);
});
test('direct marker type imports do not create runtime restrictions',async()=>{
 const clientReport=await scan({'app/page.tsx':"'use client';import type {} from 'server-only';export default function Page(){return <p/>;}"});expect(clientReport.findings).toEqual([]);
 const serverReport=await scan({'app/page.tsx':"import type {} from 'client-only';export default function Page(){return <p/>;}"});expect(serverReport.findings).toEqual([]);
});
test('properties of named hook functions are not guessed to be other React APIs',async()=>{
 const report=await scan({'app/page.tsx':"import {useState as state} from 'react';export default function Page(){state.useReducer();return <p/>;}"});expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG002']);expect(report.findings[0]?.evidence.some(e=>e.symbol==='react#useState')).toBe(true);expect(report.findings[0]?.evidence.some(e=>e.symbol==='react#useReducer')).toBe(false);
});
test('a resolved function used as an unknown callback retains phase uncertainty',async()=>{
 const report=await scan({'app/page.tsx':"'use client';declare function schedule(fn:()=>unknown):void;function callback(){return window.location.href;}export default function Page(){schedule(callback);return <p/>;}"});expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='unknown-phase')).toBe(true);
});

test('invalid required package metadata cannot silently fall back to a clean profile',async()=>{
 const report=await scan({'app/page.tsx':"export default function Page(){return <p/>;}",'package-lock.json':'{"lockfileVersion":'});
 expect(report.coverage.status).toBe('partial');expect(report.coverage.limits.some(l=>l.code==='unsupported-version')).toBe(true);expect(report.findings).toEqual([]);
});
test('unsupported apps do not materialize application bodies',async()=>{
 const report=await scan({'package.json':JSON.stringify({dependencies:{next:'15.0.0',react:'18.3.1','react-dom':'18.3.1'}}),'app/page.tsx':"export default function Page(){return <p>{window.location.href}</p>;}"});
 expect(report.metrics.sourceCount).toBe(0);expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('partial');
});
test('Edge entries remain discovered as out of scope without traversing their code',async()=>{
 const report=await scan({'app/page.tsx':"export const runtime='edge';import {readFile} from 'node:fs';export default function Page(){readFile('irrelevant');return <p>{window.location.href}</p>;}"});
 expect(report.projects).toHaveLength(1);expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');expect(report.scope.unsupported).toContainEqual({file:'app/page.tsx',feature:'edge'});
});
test('unreadable syntax including parser overflow produces a limitation',async()=>{
 for(const body of ["export const text='unterminated",'export const deep='+ '('.repeat(12000)+'0'+')'.repeat(12000)+';']) {
  const report=await scan({'app/page.tsx':"import {text} from '../lib/bad';export default function Page(){return <p>{text}</p>;}",'lib/bad.ts':body});
  expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='unsupported-syntax')).toBe(true);
 }
});
test('exported metadata functions are listed outside scope without becoming render roots',async()=>{
 const report=await scan({'app/page.tsx':"export function generateMetadata(){return {title:window.location.href};}export default function Page(){return <p/>;}"});
 expect(report.findings).toEqual([]);expect(report.scope.unsupported).toContainEqual({file:'app/page.tsx',feature:'metadata'});
});
test('a configured confidential field with an unresolved value remains unknown',async()=>{
 const reached=await scan({'app/page.tsx':"import {profile} from '../lib/profile';"+server("return <Client data={profile}/>;"),'app/client.tsx':client,'lib/profile.ts':"declare const input:any;export const profile=input;"},{schemaVersion:1,sensitive:{exports:[{file:'lib/profile.ts',export:'profile',field:['token'],category:'secret'}]}});
 expect(reached.findings).toEqual([]);expect(reached.coverage.limits.some(l=>l.code==='unknown-value'&&l.affectedRules.includes('NSG005'))).toBe(true);
});
test('source symlinks outside the root and configured root escapes are not accepted',async()=>{
 const {fixture}=await import('./helpers.js');const {mkdtemp,writeFile,symlink,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {normalizePolicy}=await import('../../src/cli/config.js');const {filesystemSnapshot}=await import('../../src/project/snapshot.js');const {analyze}=await import('../../src/analysis/analyze.js');
 const outside=await mkdtemp(join(tmpdir(),'nsg-outside-')),project=await fixture({'app/page.tsx':"import {data} from '../outside/source';export default function Page(){return <p>{data}</p>;}"});
 try {await writeFile(join(outside,'source.ts'),"export const data='FICTIONAL_OUTSIDE_VALUE';");await symlink(outside,join(project.root,'outside'),'junction');const policy=normalizePolicy();
  const report=analyze(await filesystemSnapshot(project.root,policy),policy);expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='source-excluded')).toBe(true);expect(JSON.stringify(report)).not.toContain('FICTIONAL_OUTSIDE_VALUE');
  await expect(filesystemSnapshot(project.root,normalizePolicy({schemaVersion:1,projectRoots:['.','outside']}))).rejects.toThrow('Configured project root escapes');
 }finally{await project.close();await rm(outside,{recursive:true,force:true});}
});
test('an app containing only an Edge handler is recognized with an empty supported scope',async()=>{
 const {fixture}=await import('./helpers.js'),{rm}=await import('node:fs/promises'),{join}=await import('node:path');
 const {filesystemSnapshot}=await import('../../src/project/snapshot.js'),{normalizePolicy}=await import('../../src/cli/config.js'),{analyze}=await import('../../src/analysis/analyze.js');
 const project=await fixture({'app/route.ts':"export const runtime='edge';export async function GET(){return new Response(window.location.href);}"});
 try {await rm(join(project.root,'app/layout.tsx'));const policy=normalizePolicy(),report=analyze(await filesystemSnapshot(project.root,policy),policy);expect(report.projects).toHaveLength(1);expect(report.scope.unsupported).toContainEqual({file:'app/route.ts',feature:'edge'});expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');}finally{await project.close();}
});
test('values beyond the fixed nesting budget report source-budget',async()=>{
 const expression='['.repeat(80)+'1'+']'.repeat(80);
 const report=await scan({'app/page.tsx':server(`return <Client data={${expression}}/>;`),'app/client.tsx':client});
 expect(report.findings).toEqual([]);expect(report.coverage.limits.some(l=>l.code==='source-budget'&&l.affectedRules.includes('NSG004'))).toBe(true);
});
test('installed version metadata obeys the metadata size and JSON validity budgets',async()=>{
 for(const metadata of [JSON.stringify({version:'16.3.8',padding:'x'.repeat(10*1024*1024)}),'{broken']) {
  const report=await scan({'app/page.tsx':'export default function Page(){return <p/>;}','node_modules/next/package.json':metadata});
  expect(report.coverage.status).toBe('partial');expect(report.findings).toEqual([]);expect(report.projects[0]?.nextVersion).toBeNull();expect(report.coverage.limits.some(l=>l.code===(metadata==='{'+'broken'?'unsupported-syntax':'source-budget'))).toBe(true);
 }
});
test('unrelated workspace package metadata and informational TypeScript versions do not reduce coverage',async()=>{
 const report=await scan({'package.json':JSON.stringify({dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.3.0'},workspaces:['packages/*']}),'app/page.tsx':'export default function Page(){return <p/>;}','packages/unused/package.json':JSON.stringify({name:'unused',dependencies:{next:'16.3.8'}}),'packages/unused/node_modules/next/package.json':'{broken','node_modules/typescript/package.json':'{broken'});
 expect(report.coverage.status).toBe('complete');expect(report.projects).toHaveLength(1);expect(report.projects[0]?.typescriptVersion).toBeNull();
});
