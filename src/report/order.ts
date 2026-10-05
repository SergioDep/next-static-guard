import type { Limit } from '../types.js';
import { canonical } from './fingerprint.js';
export function orderedLimits(limits:readonly Limit[]):Limit[] {
 return [...new Map(limits.map(limit=>[canonical(limit),limit])).values()].sort((a,b)=>(a.location?.file??'').localeCompare(b.location?.file??'','en')||(a.location?.start.offset??-1)-(b.location?.start.offset??-1)||a.code.localeCompare(b.code,'en')||a.snapshot.localeCompare(b.snapshot,'en')||(a.projectRoot??'').localeCompare(b.projectRoot??'','en'));
}

export function preferEvidence(candidate:readonly import('../types.js').Evidence[],current:readonly import('../types.js').Evidence[]):boolean {
 if(candidate.length!==current.length)return candidate.length<current.length;
 for(let i=0;i<candidate.length;i++) {
  const a=candidate[i]!,b=current[i]!;
  const path=(a.location?.file??'').localeCompare(b.location?.file??'','en');
  if(path)return path<0;
  const offset=(a.location?.start.offset??-1)-(b.location?.start.offset??-1);
  if(offset)return offset<0;
 }
 return false;
}
