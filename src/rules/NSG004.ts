import type ts from 'typescript';
import type { Value } from '../analysis/values.js';
import { rejected } from '../analysis/values.js';
import type { Execution } from '../analysis/phases.js';
import { location } from '../project/location.js';
import { Diagnostics } from './shared.js';
export function checkSerialization(diagnostics:Diagnostics,value:Value,site:ts.Node,state:Execution,destination:string):void {
 const bad=rejected(value);if(!bad)return;
 diagnostics.finding('NSG004',site,state.context,[...state.trace,{kind:'value',location:null,symbol:bad.origin},{kind:'sink',location:location(site),symbol:destination}],bad.origin,destination);
}
