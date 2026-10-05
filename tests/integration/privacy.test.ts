import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../unit/helpers.js';
const exec=promisify(execFile),cli=join(process.cwd(),'dist/cli/main.js');
test('CLI reads neither environment files/values nor network and never executes repository configuration',async()=>{
 const project=await fixture({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}",'.env':"TOKEN=FICTIONAL_ENV_SENTINEL",'next.config.mjs':"import {writeFileSync} from 'node:fs';writeFileSync('executed-config','unexpected');export default wrapper({});"});
 try {
  const probe=join(project.root,'privacy-probe.mjs');
  await writeFile(probe,`import fs from 'node:fs';import fsp from 'node:fs/promises';import net from 'node:net';import {syncBuiltinESMExports} from 'node:module';
const forbidden=file=>typeof file==='string'&&/(?:^|[\\\\/])\\.env(?:$|[.])/.test(file);
for(const [object,names] of [[fs,['readFile','readFileSync','open','openSync']],[fsp,['readFile','open']]])for(const name of names){const original=object[name];object[name]=function(file,...args){if(forbidden(file))throw new Error('Environment file read attempted');return original.call(this,file,...args);};}
net.Socket.prototype.connect=function(){throw new Error('Network connection attempted');};globalThis.fetch=()=>{throw new Error('Network fetch attempted');};syncBuiltinESMExports();`);
  for(const format of ['terminal','json','markdown']) {
   const result=await exec(process.execPath,['--import',probe,cli,'scan',project.root,'--format',format],{env:{...process.env,TOKEN:'FICTIONAL_PROCESS_SENTINEL'}});
   expect(result.stdout+result.stderr).not.toContain('FICTIONAL_ENV_SENTINEL');expect(result.stdout+result.stderr).not.toContain('FICTIONAL_PROCESS_SENTINEL');expect(result.stdout).toContain('NSG006');
  }
  await expect(access(join(project.root,'executed-config'))).rejects.toThrow();expect(await readFile(join(project.root,'.env'),'utf8')).toContain('FICTIONAL_ENV_SENTINEL');
 }finally{await project.close();}
});
test('source mutation during reading rejects the mixed snapshot without a report',async()=>{
 const project=await fixture({'app/page.tsx':'export default function Page(){return <p/>;}'});
 try {
  const probe=join(project.root,'mutation-probe.mjs'),target=join(project.root,'app/page.tsx');
  await writeFile(probe,`import fsp from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';const original=fsp.open;fsp.open=async function(path,...args){const handle=await original.call(this,path,...args);if(path===${JSON.stringify(target)}){const read=handle.readFile;handle.readFile=async function(...options){const result=await read.apply(this,options);await fsp.appendFile(path,'\\n// changed during snapshot');return result;};}return handle;};syncBuiltinESMExports();`);
  let stdout='',stderr='',code=0;try{const result=await exec(process.execPath,['--import',probe,cli,'scan',project.root,'--format','json']);stdout=result.stdout;stderr=result.stderr;}catch(error){const result=error as {code:number;stdout:string;stderr:string};code=result.code;stdout=result.stdout;stderr=result.stderr;}
  expect(code).toBe(2);expect(stdout).toBe('');expect(stderr).toContain('Source changed during snapshot reading');
 }finally{await project.close();}
});
test('an unreadable reached source reports a limitation without inventing a violation',async()=>{
 const project=await fixture({'app/page.tsx':"'use client';import {data} from '../lib/data';export default function Page(){return <p>{data}</p>;}",'lib/data.ts':"import 'server-only';export const data='FICTIONAL_UNREADABLE_SENTINEL';"});
 try {
  const probe=join(project.root,'read-failure-probe.mjs'),target=join(project.root,'lib/data.ts');
  await writeFile(probe,`import fsp from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';const original=fsp.open;fsp.open=async function(path,...args){if(path===${JSON.stringify(target)}){const error=new Error('FICTIONAL_UNREADABLE_SENTINEL');error.code='EACCES';throw error;}return original.call(this,path,...args);};syncBuiltinESMExports();`);
  const result=await exec(process.execPath,['--import',probe,cli,'scan',project.root,'--format','json']);const report=JSON.parse(result.stdout);expect(report.findings).toEqual([]);expect(report.coverage.status).toBe('partial');expect(report.coverage.limits.some((l:{code:string})=>l.code==='source-excluded')).toBe(true);expect(result.stdout+result.stderr).not.toContain('FICTIONAL_UNREADABLE_SENTINEL');
 }finally{await project.close();}
});
