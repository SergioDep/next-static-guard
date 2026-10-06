import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../unit/helpers.js';
const exec=promisify(execFile),cli=join(process.cwd(),'dist/cli/main.js');
async function git(root:string,...args:string[]):Promise<string>{return (await exec('git',args,{cwd:root,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'}})).stdout;}
async function scan(root:string,extra:string[]=[]) {
 try{const result=await exec(process.execPath,[cli,'scan',root,'--base','main','--format','json',...extra]);return {code:0,...result};}catch(error){const e=error as {code:number;stdout:string;stderr:string};return {code:e.code,stdout:e.stdout,stderr:e.stderr};}
}
test('PR graph finds a newly reached error in an unchanged file and protects base policy',async()=>{
 const project=await fixture({'app/page.tsx':"'use client';\nimport { text } from '../lib/safe';\nexport default function Page(){return <p>{text}</p>;}",'lib/safe.ts':"export const text='safe';",'lib/unsafe.ts':"import 'server-only';export const text='unsafe';",'next-static-guard.json':JSON.stringify({schemaVersion:1})});
 try {
  await git(project.root,'init','-b','main');await git(project.root,'-c','user.name=GuardLab','-c','user.email=guardlab@example.invalid','add','.');await git(project.root,'-c','user.name=GuardLab','-c','user.email=guardlab@example.invalid','commit','-m','Valid base');await git(project.root,'checkout','-b','feature');
  await writeFile(join(project.root,'app/page.tsx'),"'use client';\nimport { text } from '../lib/unsafe';\nexport default function Page(){return <p>{text}</p>;}");
  await writeFile(join(project.root,'next-static-guard.json'),JSON.stringify({schemaVersion:1,rules:{NSG001:'off'}}));
  const before=await git(project.root,'status','--porcelain=v1');const result=await scan(project.root);
  expect(result.code).toBe(0);const report=JSON.parse(result.stdout);expect(report.findings.map((f:{ruleId:string;status:string})=>[f.ruleId,f.status])).toEqual([['NSG001','new']]);expect(report.policy.source).toBe('base');expect(report.policy.changedFields).toEqual(['rules']);expect(await git(project.root,'status','--porcelain=v1')).toBe(before);
  const rejected=await scan(project.root,['--config',join(project.root,'next-static-guard.json')]);expect(rejected.code).toBe(2);
  await writeFile(join(project.root,'next-static-guard.json'),'INVALID FICTIONAL_SENTINEL');const ignored=await scan(project.root);expect(ignored.code).toBe(0);expect(JSON.parse(ignored.stdout).policy.ignoredCurrentConfig).toBe(true);expect(ignored.stdout+ignored.stderr).not.toContain('FICTIONAL_SENTINEL');
 }finally{await project.close();}
});
test('existing debt stays visible and a missing ref fails without a report',async()=>{
 const project=await fixture({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}"});
 try {
  await git(project.root,'init','-b','main');await git(project.root,'add','.');await git(project.root,'-c','user.name=GuardLab','-c','user.email=guardlab@example.invalid','commit','-m','Base with debt');
  const report=await scan(project.root);expect(report.code).toBe(0);expect(JSON.parse(report.stdout).findings[0].status).toBe('existing');
  const failed=await scan(project.root,['--base','missing']);expect(failed.code).toBe(2);expect(failed.stdout).toBe('');
 }finally{await project.close();}
});
test('a new App Router app can be compared with a base that has no app',async()=>{
 const project=await fixture({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}"});
 try {
  await git(project.root,'init','-b','main');await writeFile(join(project.root,'README.md'),'Fictional base repository');await git(project.root,'add','README.md');await git(project.root,'-c','user.name=GuardLab','-c','user.email=guardlab@example.invalid','commit','-m','Base without app');
  const result=await scan(project.root);expect(result.code).toBe(0);expect(JSON.parse(result.stdout).findings[0].status).toBe('new');expect(JSON.parse(result.stdout).comparison.status).toBe('complete');
 }finally{await project.close();}
});

test('missing promised objects fail without invoking a fetch helper',async()=>{
 const {rm,access}=await import('node:fs/promises');
 const project=await fixture({'app/page.tsx':"'use client';import {data} from '../lib/data';export default function Page(){return <p>{data}</p>;}",'lib/data.ts':"export const data='safe';"});
 try {
  await git(project.root,'init','-b','main');await git(project.root,'add','.');await git(project.root,'-c','user.name=GuardLab','-c','user.email=guardlab@example.invalid','commit','-m','Promisor fixture');
  const object=(await git(project.root,'rev-parse','main:lib/data.ts')).trim(),marker=join(project.root,'fetch-was-invoked');
  const helper=join(project.root,'fetch-helper.mjs');await writeFile(helper,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'unexpected transport');process.exit(1);`);
  const extEscape=(text:string)=>text.replaceAll('%','%%').replaceAll(' ','% ');
  await git(project.root,'config','core.repositoryformatversion','1');await git(project.root,'config','extensions.partialClone','origin');await git(project.root,'config','remote.origin.promisor','true');await git(project.root,'config','remote.origin.url',`ext::${extEscape(process.execPath)} ${extEscape(helper)}`);await git(project.root,'config','protocol.ext.allow','always');
  await rm(join(project.root,'.git/objects',object.slice(0,2),object.slice(2)));
  const result=await scan(project.root);expect(result.code).toBe(2);expect(result.stdout).toBe('');await expect(access(marker)).rejects.toThrow();
 }finally{await project.close();}
});
test('Git comparison without a repository or HEAD reports an operational failure',async()=>{
 const project=await fixture({'app/page.tsx':'export default function Page(){return <p/>;}'});
 try {expect((await scan(project.root)).code).toBe(2);await git(project.root,'init','-b','main');expect((await scan(project.root)).code).toBe(2);}finally{await project.close();}
});

test('Git comparison canonicalizes a symlinked scan root before mapping tree paths',async()=>{
 const {mkdtemp,symlink,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const project=await fixture({'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}"});
 const aliasParent=await mkdtemp(join(tmpdir(),'nsg-git-alias-')),alias=join(aliasParent,'app');
 try {
  await git(project.root,'init','-b','main');await git(project.root,'add','.');
  await git(project.root,'-c','user.name=GuardLab','-c','user.email=guardlab@example.invalid','commit','-m','Base');
  await symlink(project.root,alias,'junction');
  const result=await scan(alias);expect(result.stderr).toBe('');expect(result.code).toBe(0);
  const report=JSON.parse(result.stdout);expect(report.comparison.status).toBe('complete');expect(report.findings[0].status).toBe('existing');
 }finally{await rm(aliasParent,{recursive:true,force:true});await project.close();}
});
