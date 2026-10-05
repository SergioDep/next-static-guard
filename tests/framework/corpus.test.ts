import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, cp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
const exec=promisify(execFile);
const accepted=Array.from({length:24},(_,i)=>`N${String(i+1).padStart(2,'0')}`);
const rejected=Array.from({length:16},(_,i)=>`P${String(i+1).padStart(2,'0')}`);
for(const id of [...accepted,...rejected])test(`${id} independent Next build`,async()=>{
 const root=await mkdtemp(join(process.cwd(),'tests/fixtures/.framework-'));
 try {
  await cp(join(process.cwd(),'tests/fixtures/guardlab/cases',id),root,{recursive:true,filter:p=>!p.includes('/corrected')&&!p.endsWith('case.json')});
  await writeFile(join(root,'next.config.mjs'),`export default { turbopack: { root: ${JSON.stringify(process.cwd())} }, experimental: { cpus: 2 } };\n`);
  await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',plugins:[{name:'next'}],paths:{'@/*':['./*']}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}));
  if(id==='P04') {await mkdir(join(root,'node_modules/@lab'),{recursive:true});await symlink(join(root,'packages/data'),join(root,'node_modules/@lab/data'),'junction');}
  let code=0,output='';
  try {const result=await exec(process.execPath,[join(process.cwd(),'node_modules/next/dist/bin/next'),'build','--turbopack'],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},timeout:110_000,maxBuffer:4*1024*1024});output=result.stdout+result.stderr;}
  catch(error){const e=error as {code:number;stdout:string;stderr:string};code=typeof e.code==='number'?e.code:2;output=(e.stdout??'')+(e.stderr??'');}
  if(id.startsWith('N')){if(code!==0)throw new Error(`Valid ${id} rejected by Next: ${output.replace(/FICTIONAL_SENTINEL/g,'[redacted]')}`);expect(code).toBe(0);}
  else {
   expect(code).not.toBe(0);
   const expected:Record<string,RegExp>={P01:/server-only/,P02:/server-only/,P03:/next\/headers|headers/,P04:/node:fs|readFile/,P05:/useState/,P06:/useEffect/,P07:/client-only/,P08:/useRouter/,P09:/window/,P10:/document/,P11:/localStorage/,P12:/window/,P13:/function|Function/,P14:/plain objects|class/i,P15:/plain objects|prototype/i,P16:/Symbol|symbol/};
   expect(output).toMatch(expected[id]!);
  }
 }finally{await rm(root,{recursive:true,force:true});}
},120_000);
