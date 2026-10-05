import { GuardError } from '../cli/errors.js';
import type { Report } from '../types.js';
import { validateSchema } from '../cli/config.js';
export function verifyReport(report:Report):void {
 validateSchema('report',report);
 const count=(status:string)=>report.findings.filter(f=>f.status===status).length;
 if(report.summary.total!==report.findings.length||['new','existing','aggravated','unverified'].some(s=>report.summary[s as 'new']!==count(s))||report.summary.suppressed!==report.findings.filter(f=>f.suppressed).length||report.summary.blocking!==report.findings.filter(f=>f.blocking).length||report.findings.some(f=>f.suppressed&&f.blocking||f.suppressed!==(f.suppressionStatus!==null)||f.location.end.offset<f.location.start.offset)||report.coverage.status==='complete'&&report.coverage.limits.length||report.comparison.mode==='none'&&report.comparison.status!=='not-applicable')throw new GuardError('Invalid report invariants.');
}
export function jsonReport(report:Report):string { verifyReport(report);return JSON.stringify(report,null,2)+'\n'; }
