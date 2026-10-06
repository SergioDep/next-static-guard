import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { normalizePolicy } from '../../src/cli/config.js';
import { filesystemSnapshot } from '../../src/project/snapshot.js';
import { analyze } from '../../src/analysis/analyze.js';
import type { Policy } from '../../src/types.js';
export const manifest={name:'guardlab-test',private:true,type:'module',dependencies:{next:'16.3.8',react:'19.3.0','react-dom':'19.3.0',typescript:'6.0.3'}};
export async function fixture(files:Record<string,string>):Promise<{root:string;close:()=>Promise<void>}> {
 const root=await realpath(await mkdtemp(join(tmpdir(),'next-static-guard-')));
 const layoutPath=Object.keys(files).some(f=>f.startsWith('src/app/'))?'src/app/layout.tsx':'app/layout.tsx';
 for(const [path,text] of Object.entries({'package.json':JSON.stringify(manifest),[layoutPath]:'export default function Layout({children}: {children: unknown}) { return <html><body>{children}</body></html>; }',...files})) {await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text);}
 return {root,close:()=>rm(root,{recursive:true,force:true})};
}
export async function scan(files:Record<string,string>,input:unknown={schemaVersion:1}) {
 const project=await fixture(files),policy:Policy=normalizePolicy(input);
 try {return analyze(await filesystemSnapshot(project.root,policy),policy);}finally{await project.close();}
}
