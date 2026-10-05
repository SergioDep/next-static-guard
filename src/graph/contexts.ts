import type { Context, SourceNode } from '../types.js';
export function isClient(context:Context):boolean {return context==='client-browser'||context==='client-ssr';}
export function propagateContexts(directive:SourceNode['directive'],incoming:Context,browserOnly=false):Context[] {
 if(directive==='client')return browserOnly?['client-browser']:['client-browser','client-ssr'];
 if(directive==='server')return ['server-function'];
 return [incoming];
}
