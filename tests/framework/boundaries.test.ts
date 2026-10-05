import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const exec=promisify(execFile);
async function buildCase(id:string,files:Record<string,string>={},verbatimModuleSyntax=false):Promise<{code:number;output:string}> {
 const root=await mkdtemp(join(process.cwd(),'tests/fixtures/.framework-'));
 try {
  await cp(join(process.cwd(),'tests/fixtures/guardlab/cases',id),root,{recursive:true,filter:p=>!p.includes('/corrected')&&!p.endsWith('case.json')});
  for(const [path,text] of Object.entries(files))await writeFile(join(root,path),text);
  await writeFile(join(root,'next.config.mjs'),`export default { turbopack: { root: ${JSON.stringify(process.cwd())} }, experimental: { cpus: 2 } };\n`);
  await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{verbatimModuleSyntax,target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',plugins:[{name:'next'}]},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}));
  const args=[join(process.cwd(),'node_modules/next/dist/bin/next'),'build','--turbopack'];
  try{const result=await exec(process.execPath,args,{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},timeout:110_000,maxBuffer:4*1024*1024});return {code:0,output:result.stdout+result.stderr};}
  catch(error){const e=error as {code:number;stdout:string;stderr:string};return {code:typeof e.code==='number'?e.code:2,output:(e.stdout??'')+(e.stderr??'')};}
 }finally{await rm(root,{recursive:true,force:true});}
}
test('Next rejects P01 at its server-only dependency path',async()=>{
 const result=await buildCase('P01');expect(result.code).not.toBe(0);expect(result.output).toContain('server-only');expect(result.output).toContain('lib/data.ts');expect(result.output).toContain('app/page.tsx');
});
test('Next accepts the N02 Server Function reference and server-only DAL',async()=>{
 const result=await buildCase('N02');if(result.code!==0)throw new Error('Next failed the valid N02 framework control. '+result.output.replace(/FICTIONAL_SENTINEL/g,'[redacted]'));expect(result.code).toBe(0);
});
test.each(['star','named','unused','implicit-type','unused-api'] as const)('Next rejects the retained %s dependency before value invocation',async kind=>{
 const page=kind==='unused'?"'use client';import {confidential} from '../lib/secret';export default function Page(){return <p>safe</p>;}":kind==='implicit-type'?"'use client';import {Data} from '../lib/secret';export default function Page(){const data:Data={label:'safe'};return <p>{data.label}</p>;}":"'use client';import {label} from '../lib/barrel';export default function Page(){return <p>{label}</p>;"+'}';
 const barrel=kind==='named'?"export {confidential} from './secret';export {label} from './pure';":kind==='unused-api'?"export * from './unused';export * from './pure';":"export * from './secret';export * from './pure';";
 const result=await buildCase('N24',{'app/page.tsx':page,'lib/barrel.ts':barrel,'lib/secret.ts':"import 'server-only';export interface Data{label:string}export const confidential='fictional';",'lib/pure.ts':"export const label='safe';",'lib/unused.ts':"import {headers} from 'next/headers';export async function serverRead(){return headers();}"},kind==='unused'||kind==='implicit-type');
 expect(result.code).not.toBe(0);expect(result.output).toContain(kind==='unused-api'?'next/headers':'server-only');
},120_000);
test.each([false,true])('Next accepts an explicit type import with verbatimModuleSyntax %s',async verbatim=>{
 const result=await buildCase('N24',{'app/page.tsx':"'use client';import type {Data} from '../lib/secret';export default function Page(){const data:Data={label:'safe'};return <p>{data.label}</p>;}",'lib/secret.ts':"import 'server-only';export interface Data{label:string}"},verbatim);
 expect(result.code).toBe(0);
},120_000);

test.each(['unused','implicit-type'] as const)('Next elides the %s TypeScript binding with verbatimModuleSyntax disabled',async kind=>{
 const page=kind==='unused'?"'use client';import {confidential} from '../lib/secret';export default function Page(){return <p>safe</p>;}":"'use client';import {Data} from '../lib/secret';export default function Page(){const data:Data={label:'safe'};return <p>{data.label}</p>;}";
 const result=await buildCase('N24',{'app/page.tsx':page,'lib/secret.ts':"import 'server-only';export interface Data{label:string}export const confidential='fictional';"},false);expect(result.code).toBe(0);
},120_000);
