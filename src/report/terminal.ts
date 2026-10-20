import type { Report } from '../types.js';
export function safeText(value:string):string{return value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'?');}
export function terminalReport(report:Report):string {
 const lines=['Next Static Guard report v1',`Tool ${report.toolVersion}; ruleset ${report.rulesetVersion}`,`Coverage: ${report.coverage.status}; comparison: ${report.comparison.mode}/${report.comparison.status}`];
 for(const p of report.projects)lines.push(`App ${safeText(p.root)}: Next ${p.nextVersion??'unknown'}, React ${p.reactVersion??'unknown'}, React DOM ${p.reactDomVersion??'unknown'}, TypeScript ${p.typescriptVersion??'unknown'}`);
 lines.push(`Policy: ${report.policy.source}; changes: ${report.policy.changedFields.join(', ')||'none'}; ignored current configuration: ${report.policy.ignoredCurrentConfig}`);
 for(const [rule,state] of Object.entries(report.policy.effectiveRules))lines.push(`${rule}: requested ${state.requested}, effective ${state.effective}, certified ${state.certified}`);
 for(const feature of report.scope.unsupported)lines.push(`Out of scope: ${safeText(feature.file)} (${feature.feature})`);
 for(const limit of report.coverage.limits)lines.push(`Coverage ${limit.snapshot}/${safeText(limit.projectRoot??'unknown')}: ${limit.code} at ${limit.location?safeText(limit.location.file)+':'+limit.location.start.line+':'+limit.location.start.column:'unknown location'} [${limit.affectedRules.join(', ')}]`);
 for(const f of report.findings) {
  lines.push('',`${f.ruleId} ${f.severity}/${f.confidence} ${f.status}${f.suppressed?' suppressed ('+f.suppressionStatus+')':''}${f.blocking?' blocking':''} ${safeText(f.location.file)}:${f.location.start.line}:${f.location.start.column}`,f.message,`Contexts: ${f.contexts.join(', ')}`);
  for(const e of f.evidence)lines.push(`  ${e.kind}: ${safeText(e.symbol??'unknown')}${e.location?' at '+safeText(e.location.file)+':'+e.location.start.line+':'+e.location.start.column:''}`);
  lines.push(`Correction: ${f.recommendation}`,`Fingerprint: ${f.fingerprint}`);
 }
 lines.push('',`Findings: ${report.summary.total}; new ${report.summary.new}; existing ${report.summary.existing}; aggravated ${report.summary.aggravated}; unverified ${report.summary.unverified}; suppressed ${report.summary.suppressed}; blocking ${report.summary.blocking}; resolved ${report.summary.resolved.length}`);
 for(const f of report.summary.resolved)lines.push(`Resolved: ${f}`);
 lines.push(`Sources: ${report.metrics.sourceCount}; bytes: ${report.metrics.sourceBytes}; edges: ${report.metrics.edgeCount}`);
 const m=report.codeMetrics;
 if(m) {
  const pct=(v:number|null)=>v===null?'not applicable':`${(v*100).toFixed(1)}%`;
  const fix=(v:number|null)=>v===null?'not applicable':v.toFixed(1);
  lines.push(`Code metrics ${m.protocol}: files ${m.scope.files}; functions ${m.scope.functions}; LOC ${m.loc}`,
   `  M-02 cyclomatic: total ${m.cyclomatic.total}; max per function ${m.cyclomatic.maxFunction}; mean per function ${m.cyclomatic.meanFunction}`,
   `  M-03 cognitive (AST adaptation): total ${m.cognitive.total}; max per function ${m.cognitive.maxFunction}`,
   `  M-04 nesting: max ${m.nesting.max}`,
   `  M-05 Halstead volume: total ${m.halsteadVolume.total.toFixed(1)}`,
   `  M-06 maintainability index: mean ${fix(m.maintainability.mean)}; min ${fix(m.maintainability.min)}`,
   `  M-07 efferent coupling: total ${m.coupling.total}; max per file ${m.coupling.maxFile}`,
   `  M-08 import cycles: ${m.independentCycles}`,
   `  M-09 duplication: ${pct(m.duplication.ratio)} (${m.duplication.duplicatedLoc} lines)${m.duplication.partial?'; partial':''}`,
   `  M-10 boundary crossings: ${m.boundaryCrossings}`,
   `  M-11 client surface: ${pct(m.clientSurface.ratio)} (${m.clientSurface.clientLoc} lines)`,
   `  M-12 sensitive exposure: ${m.exposure.ratio===null?'not applicable (no declared sources)':`${pct(m.exposure.ratio)} (${m.exposure.exposed} of ${m.exposure.declared})`}`,
   `  M-13 findings per KLOC: ${m.findingsPerKloc?`critical ${m.findingsPerKloc.critical}; high ${m.findingsPerKloc.high}; medium ${m.findingsPerKloc.medium}; info ${m.findingsPerKloc.info}`:'not applicable'}`);
 }
 return lines.join('\n')+'\n';
}
