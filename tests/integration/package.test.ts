import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec=promisify(execFile);
test('packed CLI installs and analyzes without development sources or dependencies',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nsg-package-')),npmCli=process.env['npm_execpath'];
 if(!npmCli)throw new Error('Run package verification through npm test.');
 try {
  const pack=await exec(process.execPath,[npmCli,'pack','--json','--pack-destination',root,'--cache',join(tmpdir(),'next-static-guard-package-cache')],{cwd:process.cwd(),maxBuffer:4*1024*1024,timeout:120_000});
  const artifact=JSON.parse(pack.stdout)[0] as {filename:string;files:{path:string}[]};
  expect(artifact.files.every(f=>f.path.startsWith('dist/')||f.path.startsWith('schemas/')||['package.json','README.md','LICENSE'].includes(f.path))).toBe(true);
  const consumer=join(root,'consumer');await mkdir(consumer);await writeFile(join(consumer,'package.json'),'{"name":"guardlab-consumer","private":true}');
  await exec(process.execPath,[npmCli,'install',join(root,artifact.filename),'--ignore-scripts','--no-audit','--no-fund','--cache',join(tmpdir(),'next-static-guard-package-cache')],{cwd:consumer,timeout:120_000,maxBuffer:4*1024*1024});
  await mkdir(join(consumer,'app'));await writeFile(join(consumer,'app/page.tsx'),"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}");
  await writeFile(join(consumer,'package.json'),JSON.stringify({name:'guardlab-consumer',private:true,dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.3.0'}}));
  const cli=join(consumer,'node_modules/next-static-guard/dist/cli/main.js');
  const result=await exec(process.execPath,[cli,'scan',consumer,'--format','json']);const report=JSON.parse(result.stdout);expect(report.findings.map((f:{ruleId:string})=>f.ruleId)).toEqual(['NSG006']);expect(report.coverage.status).toBe('complete');
 }finally{await rm(root,{recursive:true,force:true});}
},120_000);
