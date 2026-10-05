import ts from 'typescript';
import type { Graph } from '../graph/build.js';
import { unshadowed } from '../analysis/symbols.js';
import type { Execution } from '../analysis/phases.js';
import { location } from '../project/location.js';
import { Diagnostics } from './shared.js';
export function browserGlobalRead(graph:Graph,node:ts.Identifier):boolean {
 if(!['window','document','localStorage'].includes(node.text)||!unshadowed(graph,node))return false;
 const p=node.parent;
 return !((ts.isPropertyAccessExpression(p)&&p.name===node)||(ts.isPropertyAssignment(p)&&p.name===node)||('name' in p&&p.name===node&&!ts.isShorthandPropertyAssignment(p))||ts.isTypeOfExpression(p));
}
export function checkBrowserGlobal(graph:Graph,diagnostics:Diagnostics,node:ts.Node,state:Execution):void {
 if(!ts.isIdentifier(node)||!browserGlobalRead(graph,node)||state.context==='client-browser'||state.browserGuard||['effect','event'].includes(state.phase))return;
 if(state.uncertainGuard){diagnostics.limit('unknown-phase',node,['NSG003']);return;}
 diagnostics.finding('NSG003',node,state.context,[...state.trace,{kind:'phase',location:location(node),symbol:`global#${node.text}`}],`global#${node.text}`,'server-execution');
}
