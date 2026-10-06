import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const exec=promisify(execFile),repo=process.cwd(),sentinel='FICTIONAL_REVIEW_TOKEN';
async function payload(dir:string):Promise<string> {
 let result='';for(const entry of await readdir(dir,{withFileTypes:true})) {
  const path=join(dir,entry.name);
  if(entry.isDirectory())result+=await payload(path);
  else if(/\.(?:html|rsc)$/.test(path))result+=await readFile(path,'utf8');
 }return result;
}
async function build(files:Record<string,string>,verbatim=false):Promise<{code:number;output:string;payload:string}> {
 const root=await mkdtemp(join(repo,'tests/fixtures/.framework-'));
 try {
  const sources={
   'package.json':JSON.stringify({private:true,dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.3.0'}}),
   'app/layout.tsx':'export default function Layout({children}:any){return <html><body>{children}</body></html>;}',
   'tsconfig.json':JSON.stringify({compilerOptions:{verbatimModuleSyntax:verbatim,target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx'},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}),
   'next.config.mjs':`export default {turbopack:{root:${JSON.stringify(repo)}},experimental:{cpus:2}};`,
   ...files,
  };
  for(const [path,text] of Object.entries(sources)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text);}
  let code=0,output='';
  try {const result=await exec(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'build','--turbopack'],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',TOKEN:sentinel},timeout:110_000,maxBuffer:4*1024*1024});output=result.stdout+result.stderr;}
  catch(error){const e=error as {code:number;stdout:string;stderr:string};if(typeof e.code!=='number')throw error;code=e.code;output=(e.stdout??'')+(e.stderr??'');}
  return {code,output:output.replaceAll(sentinel,'[redacted]'),payload:code===0?await payload(join(root,'.next/server/app')):''};
 }finally{await rm(root,{recursive:true,force:true});}
}

test.each(["export {readFile} from 'node:fs';","export * from 'node:fs';","export * as filesystem from 'node:fs';"])('Next rejects the retained filesystem reexport: %s',async declaration=>{
 const result=await build({'app/page.tsx':"'use client';import {label} from '../lib/shared';export default function Page(){return <p>{label}</p>;}",'lib/shared.ts':declaration+"export const label='Allowed';"});
 expect(result.code).not.toBe(0);expect(result.output).toMatch(/node:fs/);
});

test.each([false,true])('Next respects namespace import retention with verbatimModuleSyntax %s',async verbatim=>{
 const result=await build({'app/page.tsx':"'use client';import * as filesystem from 'node:fs';export default function Page(){return <p/>;}"},verbatim);
 if(verbatim){expect(result.code).not.toBe(0);expect(result.output).toMatch(/node:fs/);}
 else expect(result.code,result.output).toBe(0);
});

test('Next accepts an unconsumed React hook reexport in a server module',async()=>{
 const result=await build({'app/page.tsx':"import {Widget} from '../lib/ui';export default function Page(){return <Widget/>;}",'lib/ui.tsx':"export {useState} from 'react';export function Widget(){return <p/>;}"});
 expect(result.code,result.output).toBe(0);
});

test.each([false,true])('Next publishes only the rendered Server Component result: secret returned %s',async leak=>{
 const body=leak?'<span>{value}</span>':'<span>Allowed</span>';
 const result=await build({'app/page.tsx':`import Client from './client';function Panel({value,handler}:any){return ${body};}export default function Page(){return <Client><Panel value={process.env.TOKEN} handler={()=>1}/></Client>;}`,'app/client.tsx':"'use client';export default function Client({children}:any){return <div>{children}</div>;}"});
 expect(result.code,result.output).toBe(0);
 if(leak)expect(result.payload).toContain(sentinel);else expect(result.payload).not.toContain(sentinel);
});

test.each(['default-literal','default-alias','barrel'])('Next confirms confidential values reach props through %s exports',async kind=>{
 const declaration=kind==='default-literal'?`export default {email:'${sentinel}',name:'Allowed'};`:kind==='default-alias'?`const profile={email:'${sentinel}',name:'Allowed'};export default profile;`:`export const profile={email:'${sentinel}',name:'Allowed'};`;
 const source=kind==='barrel'?'../lib/barrel':'../lib/profile',binding=kind==='barrel'?'{profile}':'profile';
 const result=await build({'app/page.tsx':`import Client from './client';import ${binding} from '${source}';export default function Page(){return <Client email={profile.email}/>;}`,'app/client.tsx':"'use client';export default function Client(props:any){return <p/>;}",'lib/profile.ts':declaration,...(kind==='barrel'?{'lib/barrel.ts':"export {profile} from './profile';"}:{})});
 expect(result.code,result.output).toBe(0);expect(result.payload).toContain(sentinel);
});

test('Next resolves a namespace reexport as a real Client Component boundary',async()=>{
 const result=await build({'app/page.tsx':"import {ui} from '../lib/ui';export default function Page(){return <ui.Client handler={()=>1}/>;}",'lib/ui.ts':"export * as ui from '../app/client';",'app/client.tsx':"'use client';export function Client(props:any){return <p/>;}"});
 expect(result.code).not.toBe(0);expect(result.output).toMatch(/function|Function/);
});
