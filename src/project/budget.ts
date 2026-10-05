import { performance } from 'node:perf_hooks';
import { GuardError } from '../cli/errors.js';
let deadline=Infinity;
export function beginBudget(milliseconds=120_000):void {deadline=performance.now()+milliseconds;}
export function checkBudget():void {if(performance.now()>deadline)throw new GuardError('Analysis exceeded the execution budget.');}
