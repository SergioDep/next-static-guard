// Runs nsg-metrics-1 over GuardLab cases (original and corrected) and over extra project roots.
// Usage (after npm run build): node scripts/guardlab-metrics.mjs . <out.json> [extraRoot ...]
import { readFile, readdir, mkdtemp, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const [repo, out, ...extra] = process.argv.slice(2);
const load = p => import(pathToFileURL(join(repo, 'dist', p)).href);
const { analyze } = await load('analysis/analyze.js');
const { filesystemSnapshot } = await load('project/snapshot.js');
const { normalizePolicy } = await load('cli/config.js');

async function files(path) {
  const acc = {};
  const walk = async (dir, prefix = '') => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name === 'corrected' || e.name === 'case.json' || e.name === 'node_modules' || e.name === '.git' || e.name === '.next') continue;
      const key = prefix + e.name;
      if (e.isDirectory()) await walk(join(dir, e.name), key + '/');
      else if (e.isFile()) acc[key] = await readFile(join(dir, e.name), 'utf8');
    }
  };
  await walk(path);
  return acc;
}
async function run(path) {
  const f = await files(path);
  const root = await mkdtemp(join(tmpdir(), 'nsg-metrics-'));
  try {
    for (const [p, t] of Object.entries(f)) { await mkdir(dirname(join(root, p)), { recursive: true }); await writeFile(join(root, p), t); }
    const policy = normalizePolicy(f['next-static-guard.json'] ? JSON.parse(f['next-static-guard.json']) : undefined);
    const report = await analyze(await filesystemSnapshot(root, policy), policy);
    const m = report.codeMetrics;
    const { files: _files, ...summary } = m;
    return { findings: report.findings.map(x => x.ruleId), coverage: report.coverage.status, metrics: summary };
  } finally { await rm(root, { recursive: true, force: true }); }
}
const casesRoot = join(repo, 'tests/fixtures/guardlab/cases');
const results = { cases: [], extra: [] };
for (const id of (await readdir(casesRoot)).sort()) {
  const dir = join(casesRoot, id);
  const manifest = JSON.parse(await readFile(join(dir, 'case.json'), 'utf8'));
  const entry = { id, ruleId: manifest.ruleId ?? null, expected: manifest.expectedStatus, original: await run(dir) };
  if (manifest.correctedCase) entry.corrected = await run(join(dir, manifest.correctedCase));
  results.cases.push(entry);
  process.stderr.write(id + ' ');
}
for (const root of extra) {
  results.extra.push({ root, ...(await run(root)) });
}
await writeFile(out, JSON.stringify(results, null, 1));
process.stderr.write('\ndone\n');
