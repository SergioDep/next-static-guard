import { test, expect } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, cp, rm, writeFile, readFile, readdir, mkdir, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

const exec = promisify(execFile), repo = process.cwd(), sentinel = 'FICTIONAL_SENTINEL';
const cases = join(repo, 'tests/fixtures/guardlab/cases');
const variants = (await readdir(cases)).filter(id => id.startsWith('P')).map(id => ({id, path: join(cases, id, 'corrected')}));
for (const group of ['src-app', 'javascript', 'mjs']) {
  for (const id of await readdir(join(cases, '../variants', group))) {
    if (id.startsWith('P')) variants.push({id: `${group}/${id}`, path: join(cases, '../variants', group, id, 'corrected')});
  }
}
async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = (server.address() as {port: number}).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return value;
}
const expected: Record<string, string> = {
  P01: '<p>1</p>', P02: '<p>1</p>', P03: 'Headers read on server', P04: 'File API on server',
  P05: '<button>0</button>', P06: 'Client effect', P07: '<p>1</p>', P08: 'Router initialized',
  P13: 'Client', P14: 'Client', P15: 'Client', P16: 'Client', P17: 'Client', P18: 'Run',
  P20: 'Allowed', P21: 'Configured', P22: 'Configured', P23: 'Configured', P24: 'Configured',
};
for (const variant of variants) test(`${variant.id} correction builds and renders`, async () => {
  const root = await mkdtemp(join(repo, 'tests/fixtures/.framework-'));
  let child: ReturnType<typeof spawn> | null = null;
  const id = variant.id.split('/').at(-1)!;
  try {
    await cp(variant.path, root, {recursive: true, filter: path => !path.endsWith('case.json')});
    const app = variant.id.startsWith('src-app/') ? 'src/app' : 'app';
    if (id === 'P19') expect((await readFile(join(root, 'next.config.mjs'), 'utf8')).trim()).toBe('export default {};');
    await writeFile(join(root, 'next.config.mjs'), `export default {turbopack:{root:${JSON.stringify(repo)}},experimental:{cpus:2}};\n`);
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({compilerOptions: {
      target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true,
      strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
      resolveJsonModule: true, jsx: 'react-jsx', paths: {'@/*': ['./*']}, plugins: [{name: 'next'}],
    }, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules']}));
    if (id === 'P04' || id === 'P24') {
      await mkdir(join(root, 'node_modules/@lab'), {recursive: true});
      await symlink(join(root, 'packages/data'), join(root, 'node_modules/@lab/data'), 'junction');
    }
    if (id === 'P18') {
      await mkdir(join(root, app, 'probe'), {recursive: true});
      await writeFile(join(root, app, 'probe/route.ts'), "import {action} from '../actions';export async function GET(){return Response.json(await action());}\n");
    }
    const env = {...process.env, NEXT_TELEMETRY_DISABLED: '1', TOKEN: sentinel};
    await exec(process.execPath, [join(repo, 'node_modules/next/dist/bin/next'), 'build', '--turbopack'], {cwd: root, env, timeout: 110_000, maxBuffer: 4 * 1024 * 1024});
    const port = await availablePort();
    child = spawn(process.execPath, [join(repo, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '--hostname', '127.0.0.1'], {cwd: root, env, stdio: 'ignore'});
    let response: Response | null = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { response = await fetch(`http://127.0.0.1:${port}/`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    expect(response?.status).toBe(200);
    const html = await response!.text();
    expect(html).toContain('<body>');
    if (expected[id]) expect(html).toContain(expected[id]);
    expect(html).not.toContain(sentinel);
    if (id === 'P18') {
      const result = await fetch(`http://127.0.0.1:${port}/probe`);
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({name: 'Allowed'});
    }
  } finally {
    if (child && child.exitCode === null) {
      const stopped = new Promise<void>(resolve => child!.once('close', () => resolve()));
      child.kill(); await stopped;
    }
    await rm(root, {recursive: true, force: true});
  }
}, 120_000);
