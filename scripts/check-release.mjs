// Read-only release acceptance. Evidence belongs to the lab, not the scanner.
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { TOOL_VERSION, RULESET_VERSION } from '../dist/analysis/analyze.js';
import { cases, originalSources, token } from '../tests/quality/cases.mjs';

const repo=process.cwd(),path=resolve(process.argv[2]??'artifacts/release-candidate.json');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const digest=input=>createHash('sha256').update(input).digest('hex');
const checks=[];
const check=(name,pass)=>checks.push({name,pass:!!pass});
const index=await read(path),pkg=await read(join(repo,'package.json'));
const implementation=createHash('sha256');
async function hash(dir,prefix){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){if(e.isDirectory())await hash(join(dir,e.name),prefix+e.name+'/');else if(/\.(js|json)$/.test(e.name)){implementation.update(prefix+e.name);implementation.update(await readFile(join(dir,e.name)));}}}
await hash(join(repo,'dist'),'dist/');await hash(join(repo,'schemas'),'schemas/');
const implementationHash=implementation.digest('hex');
check('package and compiled versions agree',pkg.version===TOOL_VERSION&&index.toolVersion===TOOL_VERSION&&index.rulesetVersion===RULESET_VERSION);
const quality=await read(resolve(repo,index.quality)),manifest=await read(resolve(repo,index.manifest)),oracles=await read(resolve(repo,index.oracles));
const {corpusHash,...frozen}=manifest;
check('reserved source and oracle identities match',corpusHash===digest(JSON.stringify(frozen))&&quality.corpusHash===corpusHash&&oracles.corpusHash===corpusHash&&manifest.cases.length===cases.length&&manifest.cases.every(c=>{
 const source=cases.find(s=>s.id===c.id);if(!source)return false;const {files,configEnv,...metadata}=source,expected={...metadata,configEnvKeys:Object.keys(configEnv??{}).sort(),sources:Object.fromEntries(Object.entries(originalSources(source)).sort().map(([name,text])=>[name,digest(text)]))};return JSON.stringify(c)===JSON.stringify(expected);
}));
check('fictional oracle probe identity matches',manifest.probeValueHash===digest(token));
check('every independent framework oracle is verified',oracles.cases.length===cases.length&&new Set(oracles.cases.map(c=>c.id)).size===cases.length&&oracles.cases.every(c=>c.verified));
check('quality belongs to the current compiled engine',quality.implementationHash===implementationHash);
const sum=key=>quality.cases.reduce((n,c)=>n+c[key],0),tp=sum('tp'),fp=sum('fp'),fn=sum('fn');
check('quality counts and minimum sample agree',quality.cases.length===cases.length&&new Set(quality.cases.map(c=>c.id)).size===cases.length&&cases.every(c=>quality.cases.some(r=>r.id===c.id&&r.rule===c.rule&&r.expected===c.expected))&&tp===quality.overall.tp&&fp===quality.overall.fp&&fn===quality.overall.fn&&Object.keys(quality.perRule).length===6&&Object.entries(quality.perRule).every(([rule,r])=>r.knownPositives>=20&&r.knownPositives===cases.filter(c=>c.rule===rule&&c.expected==='finding').length)&&tp+fp>=50);
check('observed quality and coverage gates pass',tp+fp>0&&tp/(tp+fp)>=.95&&tp+fn>0&&tp/(tp+fn)>=.9&&quality.cases.every(c=>c.coverage==='complete')&&quality.qualityGate===true);
const benchmark=await read(resolve(repo,index.benchmark));
check('benchmark belongs to the current engine and required hardware',benchmark.system.implementationHash===implementationHash&&benchmark.system.measurementEligible===true&&benchmark.system.limits.cpu===2&&benchmark.system.limits.memoryBytes===4*1024**3&&benchmark.system.runs>=20);
check('all three performance scenarios pass',benchmark.results.length===3&&[['local',1000,10_000],['local',5000,30_000],['git',5000,60_000]].every(([mode,count,budget])=>{
 const r=benchmark.results.find(r=>r.mode===mode&&r.count===count);if(!r||r.samples.length<20)return false;const sorted=r.samples.map(s=>s.wallMs).sort((a,b)=>a-b),p95=sorted[Math.ceil(.95*sorted.length)-1],rss=Math.max(...r.samples.map(s=>s.peakRssBytes));return r.p95Ms===p95&&r.peakRssBytes===rss&&p95<budget&&rss<1024**3&&r.gate===true;
}));
const comparison=await read(resolve(repo,index.comparison));
check('complete tool comparison belongs to current engine',comparison.implementationHash===implementationHash&&comparison.completeMatrix===true&&comparison.cases.length===73);
const ci=await read(resolve(repo,index.ci));
check('platform/framework/benchmark/quality CI jobs passed',ci.headSha===index.testedCommit&&ci.status==='completed'&&ci.conclusion==='success'&&['check (ubuntu-24.04)','check (macos-15)','check (windows-2025)','framework','benchmark','quality'].every(name=>ci.jobs.some(j=>j.name===name&&j.conclusion==='success')));
const tarball=await readFile(resolve(repo,index.tarball)),installation=await read(resolve(repo,index.installation));
check('the exact tarball passed isolated installation',digest(tarball)===index.tarballSha256&&installation.tarballSha256===index.tarballSha256&&installation.toolVersion===TOOL_VERSION&&installation.rulesetVersion===RULESET_VERSION&&installation.passed===true);
const runtimeAudit=await read(resolve(repo,index.runtimeAudit));
check('runtime dependency audit has no high or critical advisory',runtimeAudit.metadata.vulnerabilities.high===0&&runtimeAudit.metadata.vulnerabilities.critical===0);
const ready=checks.every(c=>c.pass);
console.log(JSON.stringify({toolVersion:TOOL_VERSION,rulesetVersion:RULESET_VERSION,implementationHash,artifactReady:ready,targetMainApplied:index.targetMainApplied===true,checks},null,2));
if(!ready)process.exitCode=1;
