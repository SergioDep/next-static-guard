import { GuardError } from '../cli/errors.js';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { lstatSync } from 'node:fs';
import { dirname, delimiter, isAbsolute } from 'node:path';
import { resolve, posix } from 'node:path';
import semver from 'semver';
import type { Policy, ProjectSnapshot, SnapshotFile, Limit } from '../types.js';
import { RULE_IDS } from '../types.js';
import { excluded, inside, relativePath, materializeSources, parseJSON } from './snapshot.js';
import { sha256 } from '../report/fingerprint.js';
const exec=promisify(execFile);
function gitEnvironment(cwd:string):NodeJS.ProcessEnv {
 let worktree=cwd;
 for(let directory=cwd;;directory=dirname(directory)){try{lstatSync(resolve(directory,'.git'));worktree=directory;break;}catch{}if(dirname(directory)===directory)break;}
 const env:NodeJS.ProcessEnv={GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',LC_ALL:'C',LANG:'C'};
 for(const key of ['PATH','TMPDIR','TMP','TEMP',...(process.platform==='win32'?['SystemRoot','ComSpec','PATHEXT']:[])])if(process.env[key])env[key]=key==='PATH'?process.env[key].split(delimiter).filter(p=>isAbsolute(p)&&!inside(worktree,p)).join(delimiter):process.env[key];
 return env;
}
const prefix=['--no-lazy-fetch','--no-replace-objects','--no-optional-locks','-c','core.fsmonitor=false'];
export class GitReader {
 constructor(readonly cwd:string) {}
 async command(args:string[]):Promise<string> {
  const {stdout}=await exec('git',[...prefix,...args],{cwd:this.cwd,env:gitEnvironment(this.cwd),encoding:'utf8',maxBuffer:64*1024*1024,timeout:120_000});return stdout;
 }
 async verify():Promise<void> {
  const {stdout}=await exec('git',['--version'],{cwd:this.cwd,env:gitEnvironment(this.cwd),timeout:10_000});const match=/git version (\d+\.\d+\.\d+)/.exec(stdout)?.[1];
  if(!match||!semver.gte(match,'2.47.0'))throw new GuardError('Git >=2.47.0 is required.');
 }
 async mergeBase(ref:string):Promise<string> {
  await this.verify();
  const commit=(await this.command(['rev-parse','--verify','--end-of-options',`${ref}^{commit}`])).trim();
  const head=(await this.command(['rev-parse','--verify','HEAD^{commit}'])).trim();
  const bases=(await this.command(['merge-base','--all',head,commit])).trim().split('\n').filter(Boolean);
  if(bases.length!==1||!/^[a-f0-9]{40,64}$/.test(bases[0]!))throw new GuardError('Expected one merge-base.');return bases[0]!;
 }
 async blobs(ids:string[]):Promise<Map<string,Buffer>> {
  if(!ids.length)return new Map();
  const output=await new Promise<Buffer>((accept,reject)=>{
   const child=spawn('git',[...prefix,'cat-file','--batch'],{cwd:this.cwd,env:gitEnvironment(this.cwd),shell:false,stdio:['pipe','pipe','pipe']});
   const chunks:Buffer[]=[];let bytes=0;const timer=setTimeout(()=>child.kill(),120_000);
   child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>512*1024*1024+ids.length*100){child.kill();reject(new GuardError('Git object budget exceeded.'));}else chunks.push(chunk);});
   child.stderr.resume();child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new GuardError('Git object read failed.'));else accept(Buffer.concat(chunks));});
   child.stdin.on('error',()=>undefined);child.stdin.end(ids.join('\n')+'\n');
  });
  const result=new Map<string,Buffer>();let offset=0;
  for(const requested of ids) {
   const newline=output.indexOf(10,offset);if(newline<0)throw new GuardError('Invalid Git object protocol.');
   const header=output.subarray(offset,newline).toString('ascii'),match=/^([a-f0-9]{40,64}) blob (\d+)$/.exec(header);
   if(!match||match[1]!==requested)throw new GuardError('Missing or invalid Git object.');
   const size=Number(match[2]),start=newline+1,end=start+size;if(!Number.isSafeInteger(size)||end>=output.length||output[end]!==10)throw new GuardError('Invalid Git object protocol.');
   result.set(requested,output.subarray(start,end));offset=end+1;
  }
  if(offset!==output.length)throw new GuardError('Invalid Git object protocol.');return result;
 }
 async readConfig(commit:string,scanRoot:string):Promise<string|undefined> {
  const repo=(await this.command(['rev-parse','--show-toplevel'])).trim(),prefixPath=relativePath(repo,scanRoot);
  let path=posix.join(prefixPath,'next-static-guard.json');
  for(let hop=0;hop<16;hop++) {
   const row=(await this.command(['ls-tree','-lz','--full-tree',commit,'--',`:(literal)${path}`])).split('\0').filter(Boolean)[0];
   if(!row)return undefined;
   const tab=row.indexOf('\t'),parts=row.slice(0,tab).trim().split(/\s+/),size=Number(parts[3]);
   if(parts[1]!=='blob'||size>10*1024*1024)throw new GuardError('Base configuration is inaccessible or exceeds the size limit.');
   const buffer=(await this.blobs([parts[2]!])).get(parts[2]!)!;
   const text=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(buffer);
   if(parts[0]!=='120000')return text;
   path=posix.normalize(posix.join(posix.dirname(path),text));
   if(path.startsWith('../')||path.startsWith('/')||(prefixPath!=='.'&&!path.startsWith(prefixPath+'/')))throw new GuardError('Base configuration symlink is outside the scan root.');
  }
  throw new GuardError('Base configuration symlink cannot be resolved.');
 }
 async object(batch:ObjectBatch,id:string):Promise<Buffer> {return batch.read(id);}
 async snapshot(commit:string,scanRoot:string,policy:Policy):Promise<ProjectSnapshot> {
  const repo=(await this.command(['rev-parse','--show-toplevel'])).trim(),prefixPath=relativePath(repo,scanRoot);
  if(!inside(repo,scanRoot))throw new GuardError('Scan root is outside the Git worktree.');
  const rows=(await this.command(['ls-tree','-lrz','--full-tree',commit])).split('\0').filter(Boolean),inventory=new Set<string>(),records=new Map<string,{id:string;mode:string;size:number}>();
  for(const row of rows) {
   const tab=row.indexOf('\t'),meta=row.slice(0,tab).trim().split(/\s+/),treePath=row.slice(tab+1);
   if(prefixPath!=='.'&&!treePath.startsWith(prefixPath+'/'))continue;
   const path=prefixPath==='.'?treePath:treePath.slice(prefixPath.length+1);
   if(excluded(path,policy))continue;
   inventory.add(path);
   if(meta[1]==='blob'&&(/\.(?:[cm]?[jt]sx?|json)$/.test(path)||meta[0]==='120000'))records.set(path,{id:meta[2]!,mode:meta[0]!,size:Number(meta[3])});
  }
  const files=new Map<string,SnapshotFile>(),aliases=new Map<string,string>(),limits:Limit[]=[],failures=new Map<string,Limit['code']>(),batch=new ObjectBatch(this.cwd);
  const snapshot:ProjectSnapshot={root:resolve(scanRoot),files,inventory,aliases,limits,failures,versions:new Map(),kind:'base'};
  const read=async(path:string,metadata=false):Promise<void>=>{
   const row=records.get(path);if(!row||files.has(path)||failures.has(path))return;
   if(row.size>(metadata?10:2)*1024*1024){failures.set(path,'source-budget');return;}
   const buffer=await this.object(batch,row.id);
   let text:string;try{text=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(buffer);}catch{failures.set(path,'unsupported-syntax');return;}
   if(row.mode==='120000') {
    const destination=posix.normalize(posix.join(posix.dirname(path),text));
    if(!destination.startsWith('../')&&!destination.startsWith('/')&&(inventory.has(destination)||[...inventory].some(p=>p.startsWith(destination+'/'))))aliases.set(path,destination);
    else failures.set(path,'source-excluded');
    return;
   }
   files.set(path,{path,text,hash:sha256(buffer),bytes:buffer.length});
   if(/(?:^|\/)package(?:-lock)?\.json$/.test(path)&&!parseJSON(text))failures.set(path,'unsupported-syntax');
  };
  try {
   for(const [path,row] of records)if(row.mode==='120000')await read(path);
   for(const [alias,target] of aliases)if(!inventory.has(target)&&[...inventory].some(p=>p.startsWith(target+'/')))for(const path of inventory)if(path.startsWith(target+'/'))aliases.set(alias+path.slice(target.length),path);
   for(const [path] of records)if(/(?:^|\/)(?:package(?:-lock)?\.json|(?:ts|js)config[^/]*\.json|next\.config\.(?:js|mjs|ts)|next-static-guard\.json)$/.test(path))await read(path,true);
   await materializeSources(snapshot,policy,read);
   return snapshot;
  }finally{await batch.close();}
 }
}

/** A persistent, byte-framed reader of already-present objects; no filters or transport. */
class ObjectBatch {
 private child;
 private buffer=Buffer.alloc(0);
 private pending:{id:string;resolve:(buffer:Buffer)=>void;reject:(error:Error)=>void}[]=[];
 private cache=new Map<string,Promise<Buffer>>();
 private stopped:Error|null=null;
 private done:Promise<void>;
 constructor(cwd:string) {
  this.child=spawn('git',[...prefix,'cat-file','--batch'],{cwd,env:gitEnvironment(cwd),shell:false,stdio:['pipe','pipe','pipe']});
  this.done=new Promise((resolve,reject)=>{
   this.child.on('error',error=>{this.fail(new GuardError('Git object reader could not start.'));reject(error);});
   this.child.on('close',code=>{if(code===0)resolve();else{const error=new GuardError('Git object read failed.');this.fail(error);reject(error);}});
  });
  // Keep failures observed until close() joins the reader.
  void this.done.catch(()=>undefined);
  this.child.stderr.resume();this.child.stdin.on('error',()=>this.fail(new GuardError('Git object input failed.')));
  this.child.stdout.on('data',(chunk:Buffer)=>{this.buffer=Buffer.concat([this.buffer,chunk]);this.consume();});
 }
 private fail(error:Error):void {this.stopped=error;for(const item of this.pending)item.reject(error);this.pending=[];this.child.kill();}
 private consume():void {
  while(this.pending.length) {
   const newline=this.buffer.indexOf(10);if(newline<0)return;
   const header=this.buffer.subarray(0,newline).toString('ascii'),match=/^([a-f0-9]{40,64}) blob (\d+)$/.exec(header),item=this.pending[0]!;
   if(!match||match[1]!==item.id){this.fail(new GuardError('Missing or invalid Git object.'));return;}
   const size=Number(match[2]),end=newline+1+size;
   if(!Number.isSafeInteger(size)||size>10*1024*1024){this.fail(new GuardError('Git object exceeds its read budget.'));return;}
   if(this.buffer.length<=end)return;
   if(this.buffer[end]!==10){this.fail(new GuardError('Invalid Git object protocol.'));return;}
   const body=Buffer.from(this.buffer.subarray(newline+1,end));this.buffer=this.buffer.subarray(end+1);this.pending.shift();item.resolve(body);
  }
 }
 read(id:string):Promise<Buffer> {
  if(this.stopped)return Promise.reject(this.stopped);
  let promise=this.cache.get(id);
  if(!promise){promise=new Promise<Buffer>((resolve,reject)=>{this.pending.push({id,resolve,reject});this.child.stdin.write(id+'\n');});this.cache.set(id,promise);}
  return promise;
 }
 async close():Promise<void> {this.child.stdin.end();await this.done;}
}
