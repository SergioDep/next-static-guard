import { GuardError } from './errors.js';
import { lstat, readFile, realpath, open, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectSnapshot } from '../types.js';
import { validateSchema } from './config.js';
export const temporaryOutputs=new Set<string>();
export async function writeOutput(path:string,body:string,format:'terminal'|'json'|'markdown',snapshot:ProjectSnapshot,protectedPaths:string[]):Promise<void> {
 path=resolve(path);
 const parent=await realpath(dirname(path));
 // A symlinked parent is allowed only when it cannot disguise a protected input.
 const actual=resolve(parent,path.slice(dirname(path).length+1));
 if(protectedPaths.some(p=>resolve(p)===path||resolve(p)===actual)||snapshot.inventory.has(path.slice(snapshot.root.length+1).replace(/\\/g,'/')))throw new GuardError('Output collides with an analysis input.');
 try {
  const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>10*1024*1024)throw new GuardError('Output target is not a replaceable Guard report.');
  const previous=await readFile(path,'utf8');
  if(format==='json')validateSchema('report',JSON.parse(previous));
  else if(!previous.startsWith(format==='markdown'?'# Next Static Guard report v1\n':'Next Static Guard report v1\n'))throw new GuardError('Output target is not a replaceable Guard report.');
 } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new GuardError('Output target is not a replaceable Guard report.'); }
 const temp=resolve(parent,`.next-static-guard-${randomUUID()}.tmp`);temporaryOutputs.add(temp);
 try {const file=await open(temp,'wx',0o600);try {await file.writeFile(body,'utf8');await file.sync();}finally{await file.close();}await rename(temp,path);}
 finally {await unlink(temp).catch(()=>undefined);temporaryOutputs.delete(temp);}
}
export async function cleanupOutputs():Promise<void>{await Promise.all([...temporaryOutputs].map(f=>unlink(f).catch(()=>undefined)));}
