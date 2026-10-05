import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { release } from 'node:os';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
const exec=promisify(execFile),repo=process.cwd(),cli=join(repo,'tests/bench/measure.mjs');
const runs=Number(process.env.NSG_BENCH_RUNS??20);
if(!Number.isInteger(runs)||runs<1)throw new Error('NSG_BENCH_RUNS must be a positive integer.');
const output=join(repo,'bench-results');await mkdir(output,{recursive:true});
const manifest={name:'guardlab-benchmark',private:true,type:'module',dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.3.0',typescript:'6.0.3'}};
async function dataset(count) {
 const root=await mkdtemp(join(tmpdir(),'nsg-bench-'));
 let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const put=async(path,text)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text);};
 const padded=text=>text+'\n/*'+'.'.repeat(Math.max(0,4096-Buffer.byteLength(text)-6))+'*/\n';
 await put('package.json',JSON.stringify(manifest));
 const modules=count-4,shared=Math.floor(modules*0.1),server=Math.floor((modules-shared)/2),client=modules-server-shared;
 const groups=[['server',server],['client',client],['shared',shared]];
 for(const [group,size] of groups)for(let i=0;i<size;i++) {
  const targets=[...new Set([i+1,i+2,i+3+Math.floor(random()*5)])].filter(t=>t<size);
  const imports=targets.map(t=>`import {v as v${t}} from './m${t}';`).join('\n');
  const extra=group!=='shared'&&i===size-1?"import {v as shared} from '../shared/m0';":'';
  const text=`${imports}\n${extra}\nexport const v=[${targets.map(t=>'v'+t).join(',')}${extra?',shared':''}].length;`;
  await put(`lib/${group}/m${i}.ts`,padded(text));
 }
 for(const [name,target] of [['a','server'],['b','server']])await put(name==='a'?'app/page.tsx':'app/other/page.tsx',padded(`import {v} from '${name==='a'?'../':'../../'}lib/${target}/m0';import Client from '${name==='a'?'./ui/a':'../ui/b'}';export default function Page(){return <><p>{v}</p><Client/></>;}`));
 for(const name of ['a','b'])await put(`app/ui/${name}.tsx`,padded("'use client';import {v} from '../../lib/client/m0';export default function Client(){return <p>{v}</p>;}"));
 return {root,modules,groups};
}
async function measure(root,args) {
 const wall=performance.now();
 const result=await exec('/usr/bin/time',['-f','%M','-o',join(root,'rss.txt'),process.execPath,cli,'scan',root,'--format','json',...args],{maxBuffer:8*1024*1024,timeout:120_000});
 const report=JSON.parse(result.stdout);
 const marker=/NSG_BENCH_MEASUREMENT (.+)/.exec(result.stderr);
 if(!marker)throw new Error('Missing benchmark IO measurement.');
 const {gitIoMs}=JSON.parse(marker[1]);
 if(report.findings.length||report.coverage.status!=='complete')throw new Error('Benchmark generated an invalid or incomplete scenario.');
 return {wallMs:performance.now()-wall,peakRssBytes:Number((await readFile(join(root,'rss.txt'),'utf8')).trim())*1024,sourceCount:report.metrics.sourceCount,sourceBytes:report.metrics.sourceBytes,edgeCount:report.metrics.edgeCount,analysisMs:report.metrics.durationMs,gitIoMs,exitStatus:0};
}
const gitVersion=(await exec('git',['--version'])).stdout.trim();
const cpu=await readFile('/sys/fs/cgroup/cpu.max','utf8').catch(()=>null),memory=await readFile('/sys/fs/cgroup/memory.max','utf8').catch(()=>null);
const observedCpu=cpu&&!cpu.startsWith('max')?Number(cpu.split(' ')[0])/Number(cpu.split(' ')[1]):null,observedMemory=memory&&memory.trim()!=='max'?Number(memory.trim()):null;
const constrained=observedCpu===2&&observedMemory===4*1024**3;
const implementation=createHash('sha256');
async function hashDirectory(dir,prefix='') {for(const name of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {if(name.isDirectory())await hashDirectory(join(dir,name.name),prefix+name.name+'/');else if(name.name.endsWith('.js')||name.name.endsWith('.json')){implementation.update(prefix+name.name);implementation.update(await readFile(join(dir,name.name)));}}}
await hashDirectory(join(repo,'dist'),'dist/');await hashDirectory(join(repo,'schemas'),'schemas/');
const system={implementationHash:implementation.digest('hex'),kernel:release(),platform:process.platform,arch:process.arch,node:process.version,npm:(await exec('npm',['--version'])).stdout.trim(),git:gitVersion,seed:42,runs,limits:{cpu:observedCpu,memoryBytes:observedMemory},measurementEligible:constrained&&runs>=20};
const results=[];
for(const count of [1000,5000]) {
 const data=await dataset(count);
 try {
  await measure(data.root,[]);
  const local=[];for(let i=0;i<runs;i++)local.push(await measure(data.root,[]));
  const sorted=local.map(r=>r.wallMs).sort((a,b)=>a-b),p95Ms=sorted[Math.ceil(0.95*runs)-1],peakRssBytes=Math.max(...local.map(r=>r.peakRssBytes));
  results.push({mode:'local',count,p95Ms,peakRssBytes,samples:local,gate:p95Ms<(count===1000?10_000:30_000)&&peakRssBytes<1024**3});
  if(count===5000) {
   const git=async(...args)=>exec('git',args,{cwd:data.root});
   await git('init','-b','main');await git('add','.');await git('-c','user.name=GuardLab','-c','user.email=guardlab@example.invalid','commit','-m','Benchmark base');
   await git('checkout','-b','head');
   for(let i=0;i<Math.floor(data.modules*0.01);i++) {
    const path=join(data.root,`lib/server/m${i}.ts`);const text=await readFile(path,'utf8');await writeFile(path,text.replace(`./m${i+1}'`,`./m${i+4}'`));
   }
   const pr=[];await measure(data.root,['--base','main']);for(let i=0;i<runs;i++)pr.push(await measure(data.root,['--base','main']));
   const sorted=pr.map(r=>r.wallMs).sort((a,b)=>a-b),p95Ms=sorted[Math.ceil(0.95*runs)-1],peakRssBytes=Math.max(...pr.map(r=>r.peakRssBytes));
   results.push({mode:'git',count,p95Ms,peakRssBytes,samples:pr,gate:p95Ms<60_000&&peakRssBytes<1024**3});
  }
 }finally{await rm(data.root,{recursive:true,force:true});}
}
await writeFile(join(output,'results.json'),JSON.stringify({system,results},null,2)+'\n');
console.log(JSON.stringify(results.map(({samples,...r})=>r),null,2));
if(runs>=20&&results.some(r=>!r.gate))process.exitCode=1;
