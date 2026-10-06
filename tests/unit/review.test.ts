import { test, expect } from 'vitest';
import { scan } from './helpers.js';

const client="'use client';export default function Client({children,...props}:any){return <div>{children}</div>;}";
const secretPolicy={schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}};

test.each(['fs','node:fs','fs/promises','node:fs/promises'])('retained namespace imports of %s are server-only dependencies',async module=>{
 const page=`'use client';import * as filesystem from '${module}';export default function Page(){return <p/>;}`;
 const files={'app/page.tsx':page,'tsconfig.json':'{"compilerOptions":{"verbatimModuleSyntax":true}}'};
 const retained=await scan(files);expect(retained.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(retained.coverage.status).toBe('complete');
 const elided=await scan({...files,'tsconfig.json':'{"compilerOptions":{"verbatimModuleSyntax":false}}'});
 expect(elided.findings).toEqual([]);expect(elided.coverage.status).toBe('complete');
});

test.each(["export {readFile} from 'node:fs';","export * from 'node:fs';","export * as filesystem from 'node:fs';"])('retains a filesystem reexport without consuming its exported value: %s',async declaration=>{
 const report=await scan({'app/page.tsx':"'use client';import {label} from '../lib/shared';export default function Page(){return <p>{label}</p>;}",'lib/shared.ts':declaration+"export const label='Allowed';"});
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(report.coverage.status).toBe('complete');
 expect(report.findings[0]?.evidence.map(e=>e.symbol)).toEqual(['../lib/shared','node:fs']);
});

test('used namespace imports group the restriction at the actual use',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import * as filesystem from 'node:fs';export default function Page(){filesystem.readFileSync('fictional');return <p/>;}"});
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);
});

test('explicit filesystem type reexports and unconsumed React hook reexports are valid',async()=>{
 for(const declaration of ["export type {Stats} from 'node:fs';","export {type Stats} from 'node:fs';"]) {
  const report=await scan({'app/page.tsx':"'use client';import {label} from '../lib/shared';export default function Page(){return <p>{label}</p>;}",'lib/shared.ts':declaration+"export const label='Allowed';"});
  expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
 }
 const hooks=await scan({'app/page.tsx':"import {Widget} from '../lib/ui';export default function Page(){return <Widget/>;}",'lib/ui.tsx':"export {useState} from 'react';export function Widget(){return <p/>;}"});
 expect(hooks.findings).toEqual([]);expect(hooks.coverage.status).toBe('complete');
});

test('explicit exports override star reexports regardless of statement order',async()=>{
 for(const declaration of ["export const label='Allowed';","const text='Allowed';export {text as label};","export function label(){return 'Allowed';}"]) {
  const report=await scan({'app/page.tsx':"'use client';import {label} from '../lib/shared';export default function Page(){return <p>{typeof label==='function'?label():label}</p>;}",'lib/shared.ts':"export * from 'node:fs';"+declaration});
  expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);
  expect(report.findings[0]?.location.file).toBe('lib/shared.ts');
 }
});

test('namespace reexports resolve the actual client component and its props',async()=>{
 const report=await scan({'app/page.tsx':"import {ui} from '../lib/ui';export default function Page(){return <ui.Client token={process.env.TOKEN}/>;}",'lib/ui.ts':"export * as ui from '../app/client';",'app/client.tsx':"'use client';export function Client(props:any){return <p/>;}"},secretPolicy);
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);expect(report.coverage.status).toBe('complete');
});

test('literal filesystem imports in an executed client callback retain their restriction',async()=>{
 const report=await scan({'app/page.tsx':"'use client';import {useEffect} from 'react';export default function Page(){useEffect(()=>{import('node:fs');},[]);return <p/>;}"});
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG001']);expect(report.coverage.status).toBe('complete');
});

test.each([
 '<Client><span>{process.env.TOKEN}</span></Client>',
 '<Client><><span>{process.env.TOKEN}</span></></Client>',
 '<Client element={<span title={process.env.TOKEN}/>}/>',
 '<Client element={<span {...{title:process.env.TOKEN}}/>}/>',
 '<Client><Panel value={process.env.TOKEN}/></Client>',
])('declared secrets in rendered React elements retain their publication path: %s',async jsx=>{
 const page="import Client from './client';function Panel({value}:any){return <span>{value}</span>;}export default function Page(){return "+jsx+';}';
 const report=await scan({'app/page.tsx':page,'app/client.tsx':client},secretPolicy);
 expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);expect(report.coverage.status).toBe('complete');
 expect(report.findings[0]?.evidence.some(e=>e.symbol==='env#TOKEN')).toBe(true);
});

test.each([
 '<Client><span>Allowed</span></Client>',
 '<Client><Panel handler={()=>1}/></Client>',
 '<Client><Panel value={process.env.TOKEN}/></Client>',
 '<Client element={<span {...{title:process.env.TOKEN}} title="Allowed"/>}/>',
])('server-only inputs and overwritten element props are not publication: %s',async jsx=>{
 const page="import Client from './client';function Panel(props:any){return <span>Allowed</span>;}export default function Page(){return "+jsx+';}';
 const report=await scan({'app/page.tsx':page,'app/client.tsx':client},secretPolicy);
 expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('complete');
});

test.each([
 {declaration:"export default {email:'FICTIONAL_EXPORT_SECRET',name:'Allowed'};",imported:'profile',exportName:'default',file:'lib/profile.ts'},
 {declaration:"const profile={email:'FICTIONAL_EXPORT_SECRET',name:'Allowed'};export default profile;",imported:'profile',exportName:'default',file:'lib/profile.ts'},
 {declaration:"export const profile={email:'FICTIONAL_EXPORT_SECRET',name:'Allowed'};",imported:'{profile}',exportName:'profile',file:'lib/barrel.ts'},
])('export sensitivity survives default and reexport identities: $file#$exportName',async item=>{
 const files={'lib/profile.ts':item.declaration,'lib/barrel.ts':"export {profile} from './profile';",'app/client.tsx':client,'app/page.tsx':`import Client from './client';import ${item.imported} from '../${item.file.slice(0,-3)}';export default function Page(){return <Client email={profile.email}/>;}`};
 const policy={schemaVersion:1,sensitive:{exports:[{file:item.file,export:item.exportName,field:['email'],category:'private'}]}};
 const report=await scan(files,policy);expect(report.findings.map(f=>f.ruleId)).toEqual(['NSG005']);expect(report.coverage.status).toBe('complete');
 expect(JSON.stringify(report)).not.toContain('FICTIONAL_EXPORT_SECRET');
 const safe=await scan({...files,'app/page.tsx':files['app/page.tsx'].replace('profile.email','profile.name')},policy);
 expect(safe.findings).toEqual([]);expect(safe.coverage.status).toBe('complete');
});
