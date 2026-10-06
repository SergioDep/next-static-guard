import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from '../unit/helpers.js';
const exec=promisify(execFile),cli=join(process.cwd(),'dist/cli/main.js');
async function run(args:string[]) {try{const result=await exec(process.execPath,[cli,...args]);return {...result,code:0};}catch(error){const e=error as {stdout:string;stderr:string;code:number};return {stdout:e.stdout,stderr:e.stderr,code:e.code};}}
test('strict arguments and exit codes',async()=>{
 for(const args of [['scan','--format','json','--format','json'],['--help','--output','out'],['scan','--unknown'],['scan','a','b'],['scan','--base','main','--baseline','base.json']])expect((await run(args)).code).toBe(2);
 expect((await run([])).code).toBe(0);expect((await run(['--version'])).stdout.trim()).toBe('0.1.0-beta.1');
});
test('report, atomic replacement, baseline, strict coverage, and symlink refusal',async()=>{
 const project=await fixture({'app/page.tsx':"'use client';\nexport default function Page(){return <p>{process.env.TOKEN}</p>;}"});
 try {
  const out=join(project.root,'report.json');
  expect((await run(['scan',project.root,'--format','json','--output',out])).code).toBe(0);
  const initial=JSON.parse(await readFile(out,'utf8')) as {findings:{status:string}[]};expect(initial.findings[0]?.status).toBe('new');
  const comparison=await run(['scan',project.root,'--format','json','--baseline',out]);expect(comparison.code).toBe(0);expect(JSON.parse(comparison.stdout).findings[0].status).toBe('existing');
  expect((await run(['scan',project.root,'--format','json','--output',out])).code).toBe(0);
  const link=join(project.root,'link.json');await symlink(out,link);expect((await run(['scan',project.root,'--format','json','--output',link])).code).toBe(2);
  const before=await readFile(out,'utf8');await writeFile(join(project.root,'next-static-guard.json'),'invalid confidential content');expect((await run(['scan',project.root,'--format','json','--output',out])).code).toBe(2);expect(await readFile(out,'utf8')).toBe(before);
  await writeFile(join(project.root,'next-static-guard.json'),'{"schemaVersion":1}');await writeFile(join(project.root,'app/page.tsx'),"import { something } from 'unmodeled-package';export default function Page(){return <p>{something}</p>;}");
  const strict=await run(['scan',project.root,'--strict-coverage','--format','json']);expect(strict.code).toBe(2);expect(JSON.parse(strict.stdout).coverage.status).toBe('partial');
 }finally{await project.close();}
});
test('empty option values cannot silently disable comparison or output',async()=>{
 for(const name of ['base','baseline','output','config','format'])expect((await run(['scan',`--${name}=`])).code).toBe(2);
});

test('all formats are deterministic and Markdown escapes repository names',async()=>{
 const project=await fixture({'app/page.tsx':"import Client from './ui[cart]';export default function Page(){return <Client/>;}",'app/ui[cart].tsx':"'use client';export default function Client(){return <p>{process.env.TOKEN}</p>;}"});
 try {
  for(const format of ['terminal','json','markdown']) {
   const first=await run(['scan',project.root,'--format',format]),second=await run(['scan',project.root,'--format',format]);
   expect(first.code).toBe(0);expect(second.code).toBe(0);
   if(format==='json') {
    const a=JSON.parse(first.stdout),b=JSON.parse(second.stdout);a.metrics.durationMs=0;b.metrics.durationMs=0;expect(a).toEqual(b);
   } else expect(first.stdout).toBe(second.stdout);
   if(format==='markdown')expect(first.stdout).toContain('ui\\[cart\\]');
  }
 }finally{await project.close();}
});

test('unmatched exceptions are stale only with complete coverage and never expose their reason',async()=>{
 const project=await fixture({'app/page.tsx':'export default function Page(){return <p/>;}', 'next-static-guard.json':JSON.stringify({schemaVersion:1,exceptions:[{ruleId:'NSG003',fingerprint:'a'.repeat(64),status:'accepted-risk',reason:'FICTIONAL_REASON_SENTINEL'}]})});
 try {
  const complete=await run(['scan',project.root,'--format','json']);expect(complete.stderr).toContain('is stale.');expect(complete.code).toBe(0);
  await writeFile(join(project.root,'app/page.tsx'),"import {data} from 'unknown-package';export default function Page(){return <p>{data}</p>;}");
  const partial=await run(['scan',project.root,'--format','json']);expect(partial.stderr).toContain('is unresolved.');expect(partial.code).toBe(0);
  for(const result of [complete,partial])expect(result.stdout+result.stderr).not.toContain('FICTIONAL_REASON_SENTINEL');
 }finally{await project.close();}
});

test.each(['timeout','SIGINT','SIGTERM'] as const)('%s preserves the previous report and returns its operational exit code',async outcome=>{
 const project=await fixture({'app/page.tsx':'export default function Page(){return <p/>;}'});
 try {
  const output=join(project.root,'report.json');expect((await run(['scan',project.root,'--format','json','--output',output])).code).toBe(0);
  const previous=await readFile(output,'utf8'),preload=join(project.root,'runtime-control.mjs');
  const signal=JSON.stringify(outcome);
  await writeFile(preload,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const timer=globalThis.setTimeout,stat=fs.promises.stat;fs.promises.stat=async(...args)=>{await new Promise(resolve=>timer(resolve,50));return stat(...args);};syncBuiltinESMExports();globalThis.setTimeout=(callback,delay,...args)=>timer(delay===120000?${outcome==='timeout'?'callback':`()=>process.platform==='win32'?process.emit(${signal}):process.kill(process.pid,${signal})`}:callback,delay===120000?1:delay,...args);\n`);
  let code=0,stdout='',stderr='';
  try {const result=await exec(process.execPath,['--import',pathToFileURL(preload).href,cli,'scan',project.root,'--format','json','--output',output]);stdout=result.stdout;stderr=result.stderr;}
  catch(error){const result=error as {code:number;stdout:string;stderr:string};code=result.code;stdout=result.stdout;stderr=result.stderr;}
  expect(code).toBe(outcome==='timeout'?2:outcome==='SIGINT'?130:143);expect(stdout).toBe('');expect(await readFile(output,'utf8')).toBe(previous);
  if(outcome==='timeout')expect(stderr).toContain('execution budget');
 }finally{await project.close();}
});
