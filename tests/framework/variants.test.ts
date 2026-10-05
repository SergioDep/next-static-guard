import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, cp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const exec=promisify(execFile),repo=process.cwd();
async function collect(dir:string,extensions:RegExp):Promise<string> {
 let output='';for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())output+=await collect(path,extensions);else if(extensions.test(entry.name))output+=await readFile(path,'utf8');}return output;
}
for(const group of ['src-app','javascript','mjs'])for(const id of await readdir(join(repo,'tests/fixtures/guardlab/variants',group)))test(`${group}/${id} independent framework verification`,async()=>{
 const root=await mkdtemp(join(repo,'tests/fixtures/.framework-'));
 try {
  await cp(join(repo,'tests/fixtures/guardlab/variants',group,id),root,{recursive:true,filter:p=>!p.includes('/corrected')&&!p.endsWith('case.json')});
  await writeFile(join(root,'next.config.mjs'),`export default {turbopack:{root:${JSON.stringify(repo)}},experimental:{cpus:2}};\n`);
  await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx'},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}));
  let code=0,output='';
  try {const result=await exec(process.execPath,[join(repo,'node_modules/next/dist/bin/next'),'build','--turbopack'],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',TOKEN:'FICTIONAL_SENTINEL'},timeout:110_000,maxBuffer:4*1024*1024});output=result.stdout+result.stderr;}
  catch(error){const result=error as {code:number;stdout:string;stderr:string};if(typeof result.code!=='number')throw error;code=result.code;output=(result.stdout??'')+(result.stderr??'');}
  const rejecting=['P01','P05','P09','P13'];
  if(rejecting.includes(id)){expect(code).not.toBe(0);expect(output).toMatch(({P01:/server-only/,P05:/useState/,P09:/window/,P13:/function/i} as Record<string,RegExp>)[id]!);}
  else {
   if(code!==0)throw new Error(`Framework rejected ${group}/${id}: ${output.replaceAll('FICTIONAL_SENTINEL','[redacted]')}`);
   expect(code).toBe(0);
   if(id==='P17')expect(await collect(join(root,'.next/server/app'),/\.(?:rsc|html)$/)).toContain('FICTIONAL_SENTINEL');
   if(id==='P21'||id==='P22'){const browser=await collect(join(root,'.next/static'),/\.js$/);expect(browser).toContain('TOKEN');expect(browser).not.toContain('FICTIONAL_SENTINEL');}
  }
 }finally{await rm(root,{recursive:true,force:true});}
},120_000);
