import type { Policy } from '../types.js';
import { canonical } from '../report/fingerprint.js';
export function changedFields(a:Policy,b:Policy):string[] {
 const strip=(p:Policy)=>({...p,exceptions:p.exceptions.map(({reason:_reason,...e})=>e)});
 const left=strip(a),right=strip(b);
 return Object.keys(left).filter(k=>canonical(left[k as keyof typeof left])!==canonical(right[k as keyof typeof right])).sort();
}
