import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { cases, token } from './cases.mjs';

const exec=promisify(execFile),repo=await realpath(process.cwd()),output=join(repo,'quality-results');
const phase=process.argv[2]??'all';
if(!['all','oracle','measure'].includes(phase))throw new Error('Expected all, oracle, or measure.');
const digest=text=>createHash('sha256').update(text).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const versions={node:'24.21.0',next:'16.3.8',react:'19.3.0',reactDom:'19.3.0',typescript:'6.0.3'};
if(process.versions.node!==versions.node)throw new Error('Use the pinned Node release.');
const manifest={schemaVersion:1,sample:'reserved-synthetic-v1',provenance:'Independently authored synthetic variations; no production-repository or human-review claim.',versions,cases:cases.map(({files,...c})=>({...c,sources:Object.fromEntries(Object.entries(files).sort().map(([name,text])=>[name,digest(text)]))}))};
const corpusHash=digest(JSON.stringify(manifest));
await mkdir(output,{recursive:true});
const manifestPath=join(output,'manifest.json');
const oldManifest=await readFile(manifestPath,'utf8').catch(()=>null);
if(oldManifest&&oldManifest!==json({...manifest,corpusHash}))throw new Error('Reserved sources changed: use a new sample/output directory.');
// Freeze every expectation and source hash before invoking either tool.
await writeFile(manifestPath,json({...manifest,corpusHash}));
const config=c=>JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',verbatimModuleSyntax:!!c.verbatim,paths:{'@/*':['./*']}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']});
async function project(c,framework=false) {
 const root=await realpath(await mkdtemp(join(repo,'tests/fixtures/.framework-quality-')));
 const files={'package.json':JSON.stringify({name:'reserved-quality',private:true,type:'module',dependencies:{next:versions.next,react:versions.react,'react-dom':versions.reactDom,typescript:versions.typescript}}),'tsconfig.json':config(c),'app/layout.tsx':'export default function Layout({children}:any){return <html><body>{children}</body></html>;}',...c.files};
 if(framework&&c.oracle.kind==='client-event-error') {
  const probe="window.addEventListener('error',e=>document.body.dataset.qualityError=e.message);window.addEventListener('unhandledrejection',e=>document.body.dataset.qualityError=String(e.reason));setTimeout(()=>{document.body.dataset.qualityClicked='yes';document.querySelector('button')?.click()},2500);";
  files['app/layout.tsx']=`export default function Layout({children}:any){return <html><body>{children}<script dangerouslySetInnerHTML={{__html:${JSON.stringify(probe)}}}/></body></html>;}`;
 }
 if(c.configEnv||framework)files['next.config.mjs']=`export default ${JSON.stringify({...c.configEnv?{env:c.configEnv}:{},...framework?{turbopack:{root:repo},experimental:{cpus:2}}:{}})};`;
 if(c.sensitive)files['next-static-guard.json']=JSON.stringify({schemaVersion:1,sensitive:c.sensitive});
 if(framework&&c.oracle.kind==='action-return')files['app/probe/route.ts']="import {load} from '../actions';export async function GET(){return Response.json(await load());}";
 for(const [file,text] of Object.entries(files)){await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),text);}
 return root;
}
async function concatenate(dir,extensions) {
 let text='';for(const entry of await readdir(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())text+=await concatenate(file,extensions);else if(extensions.test(entry.name))text+=await readFile(file,'utf8');}return text;
}
async function actionReturn(root,env) {
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const child=spawn(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','-p',String(port)],{cwd:root,env,stdio:'ignore'});
 try {
  for(let attempt=0;attempt<100;attempt++) {
   try {const response=await fetch(`http://127.0.0.1:${port}/probe`);return response.status===200&&(await response.text()).includes(token);}
   catch {await new Promise(resolve=>setTimeout(resolve,100));}
  }return false;
 }finally{const stopped=new Promise(resolve=>child.once('close',resolve));child.kill();await stopped;}
}
async function clientEvent(root,env,pattern) {
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const child=spawn(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','-p',String(port)],{cwd:root,env,stdio:'ignore'});
 try {
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){try{await fetch(`http://127.0.0.1:${port}`);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  if(!ready)return {verified:false};
  const browser=process.env.NSG_QUALITY_BROWSER??'google-chrome',version=(await exec(browser,['--version'])).stdout.trim();
  const result=await exec(browser,['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run',`--user-data-dir=${join(root,'browser-profile')}`,'--dump-dom','--virtual-time-budget=8000',`http://127.0.0.1:${port}`],{timeout:30_000,maxBuffer:4*1024*1024});
  const message=/data-quality-error="([^"]*)"/.exec(result.stdout)?.[1]??'';
  return {verified:result.stdout.includes('data-quality-clicked="yes"')&&new RegExp(pattern,'i').test(message),browser:version,error:message.replaceAll(token,'[redacted]')};
 }finally{const stopped=new Promise(resolve=>child.once('close',resolve));child.kill();await stopped;}
}
async function oracle(c) {
 const root=await project(c,true),start=performance.now(),env={...process.env,NEXT_TELEMETRY_DISABLED:'1',TOKEN:token,NEXT_PUBLIC_LABEL:'Allowed'};
 try {
  let exit=0,log='';
  try{const r=await exec(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'build','--turbopack'],{cwd:root,env,timeout:120_000,maxBuffer:4*1024*1024});log=r.stdout+r.stderr;}
  catch(error){if(typeof error.code!=='number')throw error;exit=error.code;log=(error.stdout??'')+(error.stderr??'');}
  let verified=false,observation=c.oracle.kind,browserObservation;
  if(c.oracle.kind==='rejected-build')verified=exit!==0&&new RegExp(c.oracle.pattern,'i').test(log)&&!log.includes('Failed to type check');
  else if(exit===0) {
   if(c.oracle.kind==='accepted-build')verified=true;
   else if(c.oracle.kind==='action-return')verified=await actionReturn(root,env);
   else if(c.oracle.kind==='client-event-error'){browserObservation=await clientEvent(root,env,c.oracle.pattern);verified=browserObservation.verified;}
   else {
    const bundle=await concatenate(join(root,'.next/static'),/\.js$/),payload=await concatenate(join(root,'.next/server/app'),/\.(?:html|rsc)$/);
    if(c.oracle.kind==='payload-present')verified=payload.includes(token);
    if(c.oracle.kind==='bundle-present')verified=bundle.includes(token);
    if(c.oracle.kind==='payload-absent')verified=!payload.includes(token)&&!bundle.includes(token);
    if(c.oracle.kind==='bundle-absent-private')verified=bundle.includes(c.oracle.pattern)&&!bundle.includes(token);
   }
  }
  // Only redacted lab diagnostics are written; never store actual environment values.
  if(!verified)await writeFile(join(output,`${c.id}.oracle.log`),log.replaceAll(token,'[redacted]').replaceAll(root,'<fixture>'));
  return {id:c.id,verified,exitStatus:exit,observation,...browserObservation?{browserObservation}:{},reference:c.reference,reviewer:'automated independent Next build/runtime observation',wallMs:performance.now()-start};
 }finally{await rm(root,{recursive:true,force:true});}
}
const oraclePath=join(output,'oracles.json');
let oracles=JSON.parse(await readFile(oraclePath,'utf8').catch(()=>JSON.stringify({corpusHash,cases:[]})));
if(oracles.corpusHash!==corpusHash)throw new Error('Oracle corpus hash mismatch.');
if(phase!=='measure') {
 let cursor=0,persistence=Promise.resolve();
 const pending=cases.filter(c=>!oracles.cases.some(r=>r.id===c.id));
 async function worker(){while(cursor<pending.length){const c=pending[cursor++],result=await oracle(c);oracles.cases.push(result);console.log(`${c.id} independent oracle ${result.verified?'verified':'FAILED'}`);persistence=persistence.then(()=>writeFile(oraclePath,json({...oracles,cases:oracles.cases.slice().sort((a,b)=>a.id.localeCompare(b.id))})));await persistence;}}
 await Promise.all([worker(),worker()]);
}
if(phase==='oracle') {if(oracles.cases.length!==cases.length||oracles.cases.some(c=>!c.verified))process.exitCode=1;}
else {
 if(oracles.cases.length!==cases.length||oracles.cases.some(c=>!c.verified))throw new Error('Every independent oracle must be verified before measuring Guard. Inspect oracle logs.');
 const implementation=createHash('sha256');
 async function hash(dir,prefix){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){if(e.isDirectory())await hash(join(dir,e.name),prefix+e.name+'/');else if(/\.(js|json)$/.test(e.name)){implementation.update(prefix+e.name);implementation.update(await readFile(join(dir,e.name)));}}}
 await hash(join(repo,'dist'),'dist/');await hash(join(repo,'schemas'),'schemas/');const implementationHash=implementation.digest('hex');
 const rows=[];
 for(const c of cases) {
  const root=await project(c),start=performance.now();
  try {
   const r=await exec(process.execPath,[join(repo,'dist/cli/main.js'),'scan',root,'--format','json'],{cwd:root,timeout:120_000,maxBuffer:8*1024*1024});
   if((r.stdout+r.stderr).includes(token))throw new Error(`Privacy regression in ${c.id}.`);
   const report=JSON.parse(r.stdout),expected=report.findings.filter(f=>c.expected==='finding'&&f.ruleId===c.rule),unexpected=report.findings.filter(f=>c.expected==='clean'||f.ruleId!==c.rule);
   rows.push({id:c.id,rule:c.rule,expected:c.expected,tp:expected.length?1:0,fn:c.expected==='finding'&&!expected.length?1:0,fp:unexpected.length,fpByRule:Object.fromEntries(Array.from({length:6},(_,i)=>`NSG00${i+1}`).map(rule=>[rule,unexpected.filter(f=>f.ruleId===rule).length])),duplicateEvidence:Math.max(0,expected.length-1),coverage:report.coverage.status,limits:report.coverage.limits.map(l=>l.code),findings:report.findings.map(f=>({rule:f.ruleId,file:f.location.file,line:f.location.start.line,trace:!!f.evidence.length,recommendation:!!f.recommendation})),wallMs:performance.now()-start});
  }finally{await rm(root,{recursive:true,force:true});}
 }
 const rate=(n,d)=>d?n/d:null;
 const wilson=(n,d)=>{if(!d)return null;const z=1.96,p=n/d,a=1+z*z/d,b=(p+z*z/(2*d))/a,c=z*Math.sqrt(p*(1-p)/d+z*z/(4*d*d))/a;return [b-c,b+c];};
 const totals=(list,rule=null)=>{const tp=list.reduce((s,r)=>s+r.tp,0),fp=rule?rows.reduce((s,r)=>s+r.fpByRule[rule],0):list.reduce((s,r)=>s+r.fp,0),fn=list.reduce((s,r)=>s+r.fn,0);return {tp,fp,fn,precision:rate(tp,tp+fp),recall:rate(tp,tp+fn),precisionWilson95:wilson(tp,tp+fp),recallWilson95:wilson(tp,tp+fn),knownPositives:tp+fn,reviewedFindings:tp+fp,coverageFailures:list.filter(r=>r.coverage!=='complete').length};};
 const perRule=Object.fromEntries(Array.from({length:6},(_,i)=>`NSG00${i+1}`).map(rule=>[rule,totals(rows.filter(c=>c.rule===rule),rule)])),overall=totals(rows);
 const qualityGate=Object.values(perRule).every(r=>r.knownPositives>=20)&&overall.reviewedFindings>=50&&overall.precision>=.95&&overall.recall>=.9&&overall.coverageFailures===0;
 await writeFile(join(output,'results.json'),json({schemaVersion:1,corpusHash,implementationHash,versions,provenance:manifest.provenance,perRule,overall,qualityGate,certificationEligible:false,limitations:['Synthetic supported-pattern sample; correlated families and no production-repository prevalence estimate.','Every rule has fewer than 50 independent reviewed findings and remains uncertified.'],cases:rows}));
 console.log(json({perRule,overall,qualityGate}));if(!qualityGate)process.exitCode=1;
}
