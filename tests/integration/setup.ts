import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
export default async function setup():Promise<void> {
 await promisify(execFile)(process.execPath,[join(process.cwd(),'node_modules/typescript/bin/tsc'),'-p','tsconfig.build.json'],{cwd:process.cwd(),timeout:120_000});
}
