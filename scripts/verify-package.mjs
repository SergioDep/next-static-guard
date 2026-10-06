import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const exec=promisify(execFile),tarball=process.argv[2],npm=process.env.npm_execpath;
if(!tarball||!npm)throw new Error('Use npm run verify:package -- /path/to/release.tgz.');
const artifact=resolve(tarball),bytes=await readFile(artifact),tarballSha256=createHash('sha256').update(bytes).digest('hex');
const root=await realpath(await mkdtemp(join(tmpdir(),'nsg-release-install-'))),results=[];
const fixtureManifest={name:'release-consumer',private:true,type:'module',dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.3.0'}};
const client="'use client';export default function Client(props:any){return <p/>;}",sentinel='FICTIONAL_PACKAGE_VERIFICATION_VALUE';
const cases=[
 ['NSG001',{'app/page.tsx':"'use client';import 'server-only';export default function Page(){return <p/>;}"}],
 ['NSG002',{'app/page.tsx':"import {useState} from 'react';export default function Page(){const [v]=useState(1);return <p>{v}</p>;}"}],
 ['NSG003',{'app/page.tsx':"'use client';export default function Page(){return <p>{window.innerWidth}</p>;}"}],
 ['NSG004',{'app/page.tsx':"import Client from './client';export default function Page(){return <Client data={()=>1}/>;}",'app/client.tsx':client}],
 ['NSG005',{'app/page.tsx':"import Client from './client';export default function Page(){return <Client data={process.env.TOKEN}/>;}",'app/client.tsx':client,'next-static-guard.json':JSON.stringify({schemaVersion:1,sensitive:{env:[{name:'TOKEN',category:'secret'}]}}),'lib/fictional.ts':`export const fictional='${sentinel}';`}],
 ['NSG006',{'app/page.tsx':"'use client';export default function Page(){return <p>{process.env.TOKEN}</p>;}"}],
];
try {
 await writeFile(join(root,'package.json'),JSON.stringify({name:'artifact-install',private:true}));
 await exec(process.execPath,[npm,'install',artifact,'--ignore-scripts','--no-audit','--no-fund','--cache',join(tmpdir(),'nsg-release-package-cache')],{cwd:root,timeout:120_000,maxBuffer:4*1024*1024});
 const installed=JSON.parse(await readFile(join(root,'node_modules/next-static-guard/package.json'),'utf8')),cli=join(root,'node_modules/next-static-guard/dist/cli/main.js');
 const version=(await exec(process.execPath,[cli,'--version'])).stdout.trim();
 if(version!==installed.version)throw new Error('Installed CLI and package versions disagree.');
 for(const [rule,files] of cases) {
  const app=join(root,rule),sources={'package.json':JSON.stringify(fixtureManifest),'app/layout.tsx':'export default function Layout({children}:any){return <html><body>{children}</body></html>;}',...files};
  for(const [name,text] of Object.entries(sources)){await mkdir(dirname(join(app,name)),{recursive:true});await writeFile(join(app,name),text);}
  const r=await exec(process.execPath,[cli,'scan',app,'--format','json','--strict-coverage'],{cwd:root,env:{...process.env,TOKEN:sentinel},timeout:120_000,maxBuffer:4*1024*1024});
  if((r.stdout+r.stderr).includes(sentinel))throw new Error('Installed package exposed a fictional value.');
  const report=JSON.parse(r.stdout);
  if(report.coverage.status!=='complete'||report.findings.length!==1||report.findings[0].ruleId!==rule)throw new Error(`Installed package failed ${rule}.`);
  results.push({rule,exitStatus:0,coverage:report.coverage.status,toolVersion:report.toolVersion,rulesetVersion:report.rulesetVersion});
 }
 const audit=JSON.parse((await exec(process.execPath,[npm,'audit','--omit=dev','--json','--cache',join(tmpdir(),'nsg-release-package-cache')],{cwd:root,timeout:120_000,maxBuffer:4*1024*1024})).stdout);
 const record={tarballSha256,bytes:bytes.length,toolVersion:version,rulesetVersion:results[0].rulesetVersion,node:process.version,passed:true,runtimeAudit:audit.metadata.vulnerabilities,cases:results};
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/package-validation-current.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));
}finally{await rm(root,{recursive:true,force:true});}
