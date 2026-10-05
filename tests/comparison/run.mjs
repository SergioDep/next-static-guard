import { ESLint } from 'eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { cruise } from 'dependency-cruiser';
import { cp, mkdtemp, rm, readFile, writeFile, mkdir, readdir, symlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
const exec=promisify(execFile),repo=process.cwd(),cases=join(repo,'tests/fixtures/guardlab/cases');
const implementation=createHash('sha256');
async function hashImplementation(dir,prefix) {
 for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
  if(entry.isDirectory())await hashImplementation(join(dir,entry.name),prefix+entry.name+'/');
  else if(entry.name.endsWith('.js')||entry.name.endsWith('.json')){implementation.update(prefix+entry.name);implementation.update(await readFile(join(dir,entry.name)));}
 }
}
await hashImplementation(join(repo,'dist'),'dist/');await hashImplementation(join(repo,'schemas'),'schemas/');
const implementationHash=implementation.digest('hex');
const variants=(await readdir(cases)).filter(id=>/^[PN]/.test(id)).map(id=>({id,path:join(cases,id)}));
for(const group of ['src-app','javascript','mjs'])for(const id of await readdir(join(cases,'../variants',group)))variants.push({id:`${group}/${id}`,path:join(cases,'../variants',group,id)});
const rows=[];
for(const variant of variants.filter(v=>!process.env.NSG_COMPARE_CASE||v.id===process.env.NSG_COMPARE_CASE).sort((a,b)=>a.id.localeCompare(b.id,'en'))) {
 const root=await mkdtemp(join(repo,'tests/fixtures/.comparison-'));
 try {
  await cp(variant.path,root,{recursive:true,filter:p=>!p.includes('/corrected')&&!p.endsWith('case.json')});
  const config={compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',types:['node','react','next'],paths:{'@/*':['./*']}},include:['app/**/*','src/app/**/*','lib/**/*','packages/**/*'],exclude:['node_modules']};
  await writeFile(join(root,'tsconfig.json'),JSON.stringify(config));
  if(variant.id==='P04'||variant.id==='P24'){await mkdir(join(root,'node_modules/@lab'),{recursive:true});await symlink(join(root,'packages/data'),join(root,'node_modules/@lab/data'),'junction');}
  const inputHash=createHash('sha256');
  async function hash(dir,prefix=''){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {if(entry.name==='node_modules')continue;const file=join(dir,entry.name);if(entry.isDirectory())await hash(file,prefix+entry.name+'/');else {inputHash.update(prefix+entry.name);inputHash.update(await readFile(file));}}}
  await hash(root);
  const start=performance.now();
  let tscExit=0,tscOutput='';
  try {const r=await exec(process.execPath,[join(repo,'node_modules/typescript/bin/tsc'),'--project',join(root,'tsconfig.json')],{cwd:root,timeout:60_000,maxBuffer:2*1024*1024});tscOutput=r.stdout;}
  catch(error){if(typeof error.code!=='number')throw error;tscExit=error.code;tscOutput=error.stdout??'';}
  const typecheck={exitStatus:tscExit,wallMs:performance.now()-start,diagnostics:[...tscOutput.matchAll(/([^\n]+)\((\d+),(\d+)\): error (TS\d+):/g)].map(m=>({file:relative(root,join(root,m[1])).replaceAll('\\','/'),line:Number(m[2]),column:Number(m[3]),code:m[4]}))};
  const lint=new ESLint({cwd:root,overrideConfigFile:true,overrideConfig:[...nextVitals,...nextTypescript,{settings:{next:{rootDir:root}},ignores:['node_modules/**']}]});
  const lintStart=performance.now(),lintResults=await lint.lintFiles(['**/*.{js,jsx,ts,tsx,mjs}']);
  const eslint={exitStatus:lintResults.some(r=>r.errorCount)?1:0,wallMs:performance.now()-lintStart,diagnostics:lintResults.flatMap(r=>r.messages.map(m=>({file:relative(root,r.filePath).replaceAll('\\','/'),line:m.line,column:m.column,ruleId:m.ruleId,severity:m.severity})))};
  const guardStart=performance.now(),guardResult=await exec(process.execPath,[join(repo,'dist/cli/main.js'),'scan',root,'--format','json'],{cwd:root,timeout:120_000,maxBuffer:8*1024*1024});
  const report=JSON.parse(guardResult.stdout),guard={exitStatus:0,wallMs:performance.now()-guardStart,coverage:report.coverage.status,findings:report.findings.map(f=>({ruleId:f.ruleId,file:f.location.file,line:f.location.start.line,evidenceLength:f.evidence.length,recommendation:!!f.recommendation}))};
  const caseData=JSON.parse(await readFile(join(variant.path,'case.json'),'utf8'));
  if(caseData.expectedStatus==='clean'&&typecheck.exitStatus!==0)throw new Error(`TypeScript rejected valid control ${variant.id}: ${JSON.stringify(typecheck.diagnostics)}`);
  if(guard.findings.map(f=>f.ruleId).join(',')!==caseData.expectedFindings.map(f=>f.ruleId).join(','))throw new Error(`Guard disagrees with independent manifest ${variant.id}.`);
  let dependencyCruiser=null;
  if(['P01','P02','P04','N01','N03'].includes(variant.id)) {
   const saved=process.cwd();process.chdir(root);
   try {
    const cruiseStart=performance.now();
    const r=await cruise(['app'],{baseDir:root,outputType:'json',validate:true,tsConfig:{fileName:'tsconfig.json'},tsPreCompilationDeps:false,doNotFollow:{path:'node_modules'},ruleSet:{forbidden:[{name:'client-server-dependency',severity:'error',from:{path:'^app/page\\.'},to:{path:'(?:^|/)server-only(?:/|$)|^(?:node:)?fs(?:/|$)',reachable:true}}]}});
    const data=typeof r.output==='string'?JSON.parse(r.output):r.output;
    dependencyCruiser={wallMs:performance.now()-cruiseStart,violations:data.summary.violations.map(v=>({from:v.from,to:v.to,rule:v.rule.name})),moduleCount:data.modules.length};
   } finally {process.chdir(saved);}
  }
  rows.push({id:variant.id,inputHash:inputHash.digest('hex'),typecheck,eslint,guard,dependencyCruiser});
  console.log(`${variant.id}: tsc ${typecheck.exitStatus}, lint ${eslint.exitStatus}, Guard ${guard.findings.length}`);
 }finally{await rm(root,{recursive:true,force:true});}
}
await mkdir(join(repo,'comparison-results'),{recursive:true});
await writeFile(join(repo,'comparison-results/results.json'),JSON.stringify({implementationHash,completeMatrix:!process.env.NSG_COMPARE_CASE,versions:{node:process.version,next:'16.3.8',typescript:'6.0.3',eslint:'9.39.5',nextConfig:'16.3.8',dependencyCruiser:'18.5.0'},cases:rows},null,2)+'\n');
