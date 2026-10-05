import type ts from 'typescript';
import type { Value } from '../analysis/values.js';
import { allOrigins } from '../analysis/values.js';
import type { Execution } from '../analysis/phases.js';
import { location } from '../project/location.js';
import { Diagnostics } from './shared.js';
export function checkConfidentialValue(diagnostics:Diagnostics,value:Value,site:ts.Node,state:Execution,destination:string):void {
 for(const origin of allOrigins(value))diagnostics.finding('NSG005',site,state.context,[...state.trace,{kind:'source',location:null,symbol:origin.id},{kind:'sink',location:location(site),symbol:destination}],origin.id,destination,origin.category==='secret'?'critical':'high');
}
