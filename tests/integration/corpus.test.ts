import { test, expect } from 'vitest';
import ts from 'typescript';
import { readFile, readdir, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture } from '../unit/helpers.js';
import { validateSchema, normalizePolicy } from '../../src/cli/config.js';
import { analyze } from '../../src/analysis/analyze.js';
import { filesystemSnapshot } from '../../src/project/snapshot.js';
import type { Location, RuleId, Severity } from '../../src/types.js';
interface Case {id:string;expectedStatus:string;expectedFindings:{ruleId:RuleId;severity:Severity;confidence:string;location:Location;symbol:string;traceSymbols:string[]}[];expectedLimits:{code:string;location:Location|null;affectedRules:RuleId[]}[];correctedCase:string|null}
const root=join(process.cwd(),'tests/fixtures/guardlab/cases');
const ids=(await readdir(root)).map(id=>({id,dir:join(root,id)}));
for(const variant of ['src-app','javascript','mjs','unsupported-syntax','outside-symlink'])for(const id of await readdir(join(root,'../variants',variant)))ids.push({id:`${variant}/${id}`,dir:join(root,'../variants',variant,id)});
async function sourceFiles(path:string):Promise<Record<string,string>> {
 const files:Record<string,string>={};
 const walk=async(dir:string,prefix=''):Promise<void>=>{for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='corrected'||entry.name==='case.json')continue;const key=prefix+entry.name;if(entry.isDirectory())await walk(join(dir,entry.name),key+'/');else files[key]=await readFile(join(dir,entry.name),'utf8');}};
 await walk(path);return files;
}
for(const {id,dir} of ids)test(`${id} semantic expectation and correction`,async()=>{
 const data=JSON.parse(await readFile(join(dir,'case.json'),'utf8')) as Case;validateSchema('case',data);
 const run=async(path:string)=>{
  const files=await sourceFiles(path),project=await fixture(files);
  let outside:string|null=null;
  try {
   if(id==='outside-symlink/U09'){outside=await mkdtemp(join(tmpdir(),'nsg-corpus-outside-'));await writeFile(join(outside,'data.ts'),"export const data='FICTIONAL_OUTSIDE_VALUE';");await symlink(outside,join(project.root,'linked'),'junction');}
   const policy=normalizePolicy(files['next-static-guard.json']?JSON.parse(files['next-static-guard.json']):undefined);return analyze(await filesystemSnapshot(project.root,policy),policy);
  }finally{await project.close();if(outside)await rm(outside,{recursive:true,force:true});}
 };
 const report=await run(dir);
 if(data.expectedStatus==='finding') {
  expect(report.findings.map(f=>f.ruleId)).toEqual(data.expectedFindings.map(f=>f.ruleId));
  for(const [i,expected] of data.expectedFindings.entries()) {
   expect(report.findings[i]?.severity).toBe(expected.severity);expect(report.findings[i]?.confidence).toBe(expected.confidence);expect(report.findings[i]?.location).toEqual(expected.location);
   const evidence=report.findings[i]!.evidence.map(e=>e.symbol).filter(s=>s!==null);
   let previous=-1;for(const symbol of expected.traceSymbols){const found=evidence.indexOf(symbol,previous+1);expect(found,`${id} missing authored trace symbol ${symbol}`).toBeGreaterThan(previous);previous=found;}
   const source=await readFile(join(dir,expected.location.file),'utf8'),ast=ts.createSourceFile(expected.location.file,source,ts.ScriptTarget.Latest,true);
   let primary:ts.Node|undefined;const locate=(node:ts.Node):void=>{if(node.getStart()===expected.location.start.offset&&node.end===expected.location.end.offset)primary=node;ts.forEachChild(node,locate);};locate(ast);
   expect(primary).toBeDefined();const scopes:string[]=[];
   for(let parent=primary!.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)||ts.isClassDeclaration(parent)){const name='name' in parent?parent.name:undefined;scopes.unshift(name&&ts.isIdentifier(name)?name.text:'<anonymous:0>');}
   expect(scopes.join('/')||'<module>').toBe(expected.symbol);
  }
  expect(data.correctedCase).not.toBeNull();
  const corrected=await run(join(dir,data.correctedCase!));validateSchema('case',JSON.parse(await readFile(join(dir,data.correctedCase!,'case.json'),'utf8')));expect(corrected.findings).toEqual([]);expect(corrected.coverage.status).toBe('complete');
 } else {
  expect(report.findings).toEqual([]);
  expect(report.coverage.status).toBe(data.expectedStatus==='clean'?'complete':'partial');
  for(const limit of data.expectedLimits)expect(report.coverage.limits.map(({snapshot:_snapshot,projectRoot:_root,...value})=>value)).toContainEqual(limit);
 }
 expect(JSON.stringify(report)).not.toContain('FICTIONAL_SENTINEL');
});
