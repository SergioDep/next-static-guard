#!/usr/bin/env node
import { GuardError, publicError } from './errors.js';
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { GitReader } from '../project/git-snapshot.js';
import { inside } from '../project/snapshot.js';
import { changedFields } from './policy.js';
import { policyHash } from '../report/fingerprint.js';
import { beginBudget } from '../project/budget.js';
import { performance } from 'node:perf_hooks';
import { normalizePolicy } from './config.js';
import { filesystemSnapshot } from '../project/snapshot.js';
import { analyze, TOOL_VERSION } from '../analysis/analyze.js';
import { jsonReport, verifyReport } from '../report/json.js';
import { terminalReport } from '../report/terminal.js';
import { markdownReport } from '../report/markdown.js';
import { compare, verifyBaseline } from './comparison.js';
import { writeOutput, cleanupOutputs } from './output.js';
import { exitCode } from '../rules/certification.js';
import type { Report } from '../types.js';
const HELP=`Next Static Guard\n\nUsage: next-static-guard scan [root] [options]\n\n  --config <path>      Read a JSON v1 policy\n  --format <format>    terminal, json, or markdown\n  --output <path>      Save a report atomically\n  --base <git-ref>     Compare against the merge-base of HEAD and ref\n  --baseline <path>    Compare against a compatible JSON report\n  --strict-coverage   Return 2 for partial coverage\n  --help              Show help\n  --version           Show version\n`;
export async function readJSON(path:string):Promise<unknown> {
 if((await stat(path)).size>10*1024*1024)throw new GuardError('JSON input exceeds the size limit.');
 const buffer=await readFile(path);
 try{return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(buffer)) as unknown;}catch{throw new GuardError('Invalid JSON input.');}
}
async function run(args:string[]):Promise<number> {
 const start=performance.now();beginBudget();
 const parsed=parseArgs({args,strict:true,allowPositionals:true,tokens:true,options:{config:{type:'string'},format:{type:'string'},output:{type:'string'},base:{type:'string'},baseline:{type:'string'},'strict-coverage':{type:'boolean'},help:{type:'boolean'},version:{type:'boolean'}}});
 const flags=parsed.tokens.filter(t=>t.kind==='option');if(new Set(flags.map(f=>f.name)).size!==flags.length)throw new GuardError('Repeated flags are not allowed.');
 const {positionals,values}=parsed;
 if(Object.values(values).some(v=>typeof v==='string'&&!v.length))throw new GuardError('Option values cannot be empty.');
 if(!args.length){process.stdout.write(HELP);return 0;}
 if(values.help||values.version) {
  if(flags.length!==1||(positionals.length&&!(positionals.length===1&&positionals[0]==='scan')))throw new GuardError('Help/version cannot be combined with analysis options.');
  process.stdout.write(values.version?`${TOOL_VERSION}\n`:HELP);return 0;
 }
 if(positionals[0]!=='scan'||positionals.length>2)throw new GuardError('Expected scan and at most one root.');
 if(values.base&&values.baseline)throw new GuardError('Base and baseline are mutually exclusive.');
 const format=values.format??'terminal';if(!['terminal','json','markdown'].includes(format))throw new GuardError('Invalid report format.');
 const root=resolve(positionals[1]??'.'), configPath=resolve(values.config??resolve(root,'next-static-guard.json'));
 let input:unknown,source:'default'|'current'|'base'|'explicit'='default';
 let baseSnapshot:Awaited<ReturnType<GitReader['snapshot']>>|null=null,baseCommit:string|null=null;
 let ignoredCurrent=false,currentHash:string|null=null,changes:string[]=[];
 if(values.base) {
  const reader=new GitReader(root);baseCommit=await reader.mergeBase(values.base);
  const repo=(await reader.command(['rev-parse','--show-toplevel'])).trim();
  if(values.config&&(inside(repo,configPath)||inside(repo,await realpath(configPath))))throw new GuardError('Git policy must be outside the worktree.');
  if(values.config){input=await readJSON(configPath);source='explicit';}
  else {const text=await reader.readConfig(baseCommit,root);input=text===undefined?undefined:JSON.parse(text);source='base';}
 }
 const applied=values.base?normalizePolicy(input):null;
 if(values.base)try {
  const current=await readJSON(resolve(root,'next-static-guard.json'));
  currentHash=policyHash(normalizePolicy(current));
  if(applied)changes=changedFields(normalizePolicy(current),applied);
 } catch(error) {
  if((error as NodeJS.ErrnoException).code!=='ENOENT') {
   if(!values.base)throw error;
   ignoredCurrent=true;changes=['config-invalid'];process.stderr.write('Warning: current configuration is invalid and ignored; using protected policy.\n');
  } else currentHash=policyHash(normalizePolicy());
 }
 if(!values.base) {
  try{input=await readJSON(configPath);source=values.config?'explicit':'current';}catch(error){if(values.config||(error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
 const policy=applied??normalizePolicy(input);
 const snapshot=await filesystemSnapshot(root,policy,values.output?resolve(values.output):null);
 // Analyze and discard the base Program before creating the current Program.
 let baseReport:Report|null=null;
 if(values.base) {
  const reader=new GitReader(root);
  baseSnapshot=await reader.snapshot(baseCommit!,root,policy);baseReport=analyze(baseSnapshot,policy);
 }
 const report=analyze(snapshot,policy);if(!report.projects.length)throw new GuardError('No App Router applications detected.');report.policy.source=source;
 report.policy.currentPolicyHash=values.base?currentHash:policyHash(policy);report.policy.changedFields=changes;report.policy.ignoredCurrentConfig=ignoredCurrent;
 if(baseReport) {compare(report,baseReport,'git',baseCommit,baseSnapshot?.inventory);report.metrics.sourceCount+=baseReport.metrics.sourceCount;report.metrics.sourceBytes+=baseReport.metrics.sourceBytes;report.metrics.edgeCount+=baseReport.metrics.edgeCount;}
 if(values.baseline){const baseline=await readJSON(resolve(values.baseline)) as Report;verifyBaseline(report,baseline);compare(report,baseline,'baseline',null);}
 for(const [rule,state] of Object.entries(report.policy.effectiveRules))if(state.requested==='error'&&state.effective!=='error')process.stderr.write(`Warning: ${rule} is not certified for blocking; using warn.\n`);
 for(const exception of policy.exceptions)if(!report.findings.some(f=>f.ruleId===exception.ruleId&&f.fingerprint===exception.fingerprint))process.stderr.write(`Warning: exception ${exception.ruleId}/${exception.fingerprint} is ${report.coverage.status==='complete'?'stale':'unresolved'}.\n`);
 report.metrics.durationMs=performance.now()-start;verifyReport(report);
 const body=format==='json'?jsonReport(report):format==='markdown'?markdownReport(report):terminalReport(report);
 if(values.output)await writeOutput(values.output,body,format as 'terminal'|'json'|'markdown',snapshot,[configPath,...(values.baseline?[resolve(values.baseline)]:[])]);else process.stdout.write(body);
 return exitCode(report,values['strict-coverage']??false);
}
const timer=setTimeout(()=>{process.stderr.write('Error: analysis exceeded the execution budget.\n');void cleanupOutputs().finally(()=>process.exit(2));},120_000);
timer.unref();
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]] as const)process.once(signal,()=>{void cleanupOutputs().finally(()=>process.exit(code));});
run(process.argv.slice(2)).then(code=>{clearTimeout(timer);process.exitCode=code;}).catch(error=>{clearTimeout(timer);process.stderr.write(`Error: ${publicError(error)}\n`);process.exitCode=2;});
