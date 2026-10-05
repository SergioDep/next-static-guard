import { GuardError } from './errors.js';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Policy, RuleId, SensitiveExport } from '../types.js';
import { RULE_IDS } from '../types.js';
import { canonical } from '../report/fingerprint.js';
const ajv = new Ajv2020({strict: true, allErrors: true});
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateSchema(name: 'config' | 'report' | 'case', value: unknown): void {
  let validate = validators.get(name);
  if (!validate) {
    const schema = JSON.parse(readFileSync(new URL(`../../schemas/${name}.v1.json`, import.meta.url), 'utf8')) as object;
    validate = ajv.compile(schema); validators.set(name, validate);
  }
  if (!validate(value)) throw new GuardError(`Invalid ${name} contract.`);
}
function path(value: string, root = false, glob = false): string {
  if ((value === '.' && root)) return value;
  if (value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/.test(value) || value.startsWith('!') || value.split('/').some(s => !s || s === '..' || s === '.') || /[\u0000-\u001f\u007f]/.test(value) || (!glob && /[*?\[\]{}]/.test(value))) throw new GuardError('Invalid configuration path.');
  return value;
}
export function normalizePolicy(input: unknown = {schemaVersion: 1}): Policy {
  validateSchema('config', input);
  const raw = input as Partial<Policy>;
  const env = raw.sensitive?.env ?? [];
  const exports = (raw.sensitive?.exports ?? []).map(e => ({...e, file: path(e.file), field: e.field ?? []}));
  const dedup = <T extends {category: string}>(values: T[], key: (v: T) => string): T[] => {
    const seen = new Map<string, T>();
    for (const value of values) { const id = key(value); if (seen.has(id) && seen.get(id)?.category !== value.category) throw new GuardError('Conflicting sensitivity categories.'); seen.set(id, value); }
    return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([,v]) => v);
  };
  const exceptions = [...(raw.exceptions ?? [])].sort((a,b) => `${a.ruleId}:${a.fingerprint}`.localeCompare(`${b.ruleId}:${b.fingerprint}`, 'en'));
  if (new Set(exceptions.map(e => `${e.ruleId}:${e.fingerprint}`)).size !== exceptions.length) throw new GuardError('Duplicate exception.');
  return {schemaVersion: 1, projectRoots: (raw.projectRoots ?? ['.']).map(p => path(p, true)).sort(), exclude: (raw.exclude ?? []).map(p => path(p, false, true)).sort(), rules: Object.fromEntries(RULE_IDS.map(r => [r, raw.rules?.[r] ?? 'warn'])) as Record<RuleId, 'off'|'warn'|'error'>, sensitive: {env: dedup(env, e => e.name), exports: dedup<SensitiveExport>(exports, e => canonical([e.file, e.export, e.field]))}, exceptions};
}
