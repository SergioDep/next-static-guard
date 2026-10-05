import type ts from 'typescript';
import type { Graph } from '../graph/build.js';
import { isClient } from '../graph/contexts.js';
import { envKey } from '../analysis/values.js';
import type { Execution } from '../analysis/phases.js';
import { location } from '../project/location.js';
import { Diagnostics } from './shared.js';
export function checkPrivateEnv(graph:Graph,diagnostics:Diagnostics,node:ts.Node,state:Execution):void {
 if(!isClient(state.context))return;
 const environment=envKey(graph,node);if(!environment)return;
 if(!environment.key){diagnostics.limit('unknown-value',node,['NSG005','NSG006']);return;}
 const key=environment.key;
 if(key==='NODE_ENV'||key.startsWith('NEXT_PUBLIC_')||graph.resolver.config.env.has(key))return;
 diagnostics.finding('NSG006',node,state.context,[...state.trace,{kind:'source',location:location(node),symbol:`env#${key}`}],`env#${key}`,'client','medium',graph.resolver.config.dynamic?'medium':'high');
}
