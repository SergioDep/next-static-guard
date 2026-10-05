import { test, expect } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, cp, rm, writeFile, readFile, readdir, mkdir, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
const exec=promisify(execFile),sentinel='FICTIONAL_SENTINEL';
async function concatenate(dir:string,extensions:RegExp):Promise<string> {
 let text='';for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())text+=await concatenate(path,extensions);else if(extensions.test(entry.name))text+=await readFile(path,'utf8');}return text;
}
async function port():Promise<number>{const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const p=(server.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return p;}
for(const id of ['P17','P18','P19','P20','P21','P22','P23','P24'])test(`${id} independent publication/substitution observation`,async()=>{
 const root=await mkdtemp(join(process.cwd(),'tests/fixtures/.framework-'));let child:ReturnType<typeof spawn>|null=null;
 try {
  await cp(join(process.cwd(),'tests/fixtures/guardlab/cases',id),root,{recursive:true,filter:p=>!p.includes('/corrected')&&!p.endsWith('case.json')});
  let original='{}';if(id==='P19'){original="{env:{TOKEN:'FICTIONAL_SENTINEL'}}";await mkdir(join(root,'app/probe'),{recursive:true});await writeFile(join(root,'app/probe/page.tsx'),"'use client';export default function Probe(){return <p>{process.env.TOKEN}</p>;}");}
  await writeFile(join(root,'next.config.mjs'),`export default {...${original},turbopack:{root:${JSON.stringify(process.cwd())}},experimental:{cpus:2}};\n`);
  await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',plugins:[{name:'next'}]},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}));
  if(id==='P24'){await mkdir(join(root,'node_modules/@lab'),{recursive:true});await symlink(join(root,'packages/data'),join(root,'node_modules/@lab/data'),'junction');}
  if(id==='P18'){await mkdir(join(root,'app/probe'),{recursive:true});await writeFile(join(root,'app/probe/route.ts'),"import {action} from '../actions';export async function GET(){return Response.json(await action());}");}
  const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',TOKEN:sentinel};
  await exec(process.execPath,[join(process.cwd(),'node_modules/next/dist/bin/next'),'build','--turbopack'],{cwd:root,env,timeout:110_000,maxBuffer:4*1024*1024});
  const browser=await concatenate(join(root,'.next/static'),/\.js$/);
  if(id==='P17'){const flight=await concatenate(join(root,'.next/server/app'),/\.(?:rsc|html)$/);expect(flight).toContain(sentinel);}
  else if(id==='P19'||id==='P20')expect(browser).toContain(sentinel);
  else if(['P21','P22','P23','P24'].includes(id)){expect(browser).toContain('TOKEN');expect(browser).not.toContain(sentinel);}
  else {
   const p=await port();child=spawn(process.execPath,[join(process.cwd(),'node_modules/next/dist/bin/next'),'start','-p',String(p),'--hostname','127.0.0.1'],{cwd:root,env,stdio:'ignore'});
   let response:Response|null=null;
   for(let attempt=0;attempt<100;attempt++){try{response=await fetch(`http://127.0.0.1:${p}/probe`);break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
   expect(response?.status).toBe(200);const data=await response!.json() as {token:string};expect(data.token).toBe(sentinel);
  }
 }finally{if(child){const stopped=new Promise<void>(resolve=>child!.once('close',()=>resolve()));child.kill();await stopped;}await rm(root,{recursive:true,force:true});}
},120_000);
