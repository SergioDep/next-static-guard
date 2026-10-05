import { performance } from 'node:perf_hooks';
import { GitReader } from '../../dist/project/git-snapshot.js';
let gitIoMs=0;
for(const name of ['verify','command','blobs','object']) {
 const original=GitReader.prototype[name];
 GitReader.prototype[name]=async function(...args) {
  const start=performance.now();
  try {return await original.apply(this,args);}
  finally {gitIoMs+=performance.now()-start;}
 };
}
process.once('exit',()=>process.stderr.write(`NSG_BENCH_MEASUREMENT ${JSON.stringify({gitIoMs})}\n`));
await import('../../dist/cli/main.js');
