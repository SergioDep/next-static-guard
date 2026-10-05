import type { Report } from '../types.js';
import { terminalReport } from './terminal.js';
export function markdownReport(report:Report):string {
 const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g,'\\$&');
 const lines=terminalReport(report).trimEnd().split('\n');
 return `# Next Static Guard report v1\n\n${lines.slice(1).map(escape).join('  \n')}\n`;
}
