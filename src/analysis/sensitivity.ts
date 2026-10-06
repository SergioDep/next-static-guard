import ts from 'typescript';
import type { Evidence, RuleId } from '../types.js';
import type { Graph } from '../graph/build.js';
import type { Execution } from './phases.js';
import { isClient } from './phases.js';
import { envKey, allOrigins, hasUnknown, rejected, Values } from './values.js';
import type { Value } from './values.js';
import { resolveReference, unshadowed } from './symbols.js';
import { location } from '../project/location.js';
import { Diagnostics } from '../rules/shared.js';
import { checkSerialization } from '../rules/NSG004.js';
import { checkConfidentialValue } from '../rules/NSG005.js';
import { checkPrivateEnv } from '../rules/NSG006.js';
import { inlineServer } from '../graph/directives.js';
export function dataHooks(graph:Graph,diagnostics:Diagnostics):{visit:(node:ts.Node,state:Execution)=>void;returnValue:(node:ts.Expression,state:Execution)=>void} {
 const values=new Values(graph,diagnostics);
 const sink=(v:Value,site:ts.Node,state:Execution,destination:string,serialization:boolean):void=>{
  const trace:Evidence[]=[...state.trace,{kind:'sink',location:location(site),symbol:destination}];
  if(serialization)checkSerialization(diagnostics,v,site,state,destination);
  checkConfidentialValue(diagnostics,v,site,state,destination);
  if(hasUnknown(v))diagnostics.limit('unknown-value',site,serialization?['NSG004','NSG005']:['NSG005']);
 };
 for(const [key,node] of graph.resolver.config.env) {
  const declared=diagnostics.policy.sensitive.env.find(e=>e.name===key);
  if(declared)diagnostics.finding('NSG005',node,'client-browser',[{kind:'source',location:null,symbol:`env#${key}`},{kind:'sink',location:location(node),symbol:`config#env.${key}`}],`env#${key}`,`config#env.${key}`,declared.category==='secret'?'critical':'high');
 }
 const returnValue=(node:ts.Expression,state:Execution):void=>{
  if(state.context!=='server-function')return;
  const file=node.getSourceFile().fileName;
  const clientReferenced=graph.uses.some(use=>use.node.file.path===file&&use.context==='server-function'&&use.trace.some(e=>e.location&&graph.uses.some(parent=>parent.node.file.path===e.location?.file&&isClient(parent.context))));
  if(clientReferenced)sink(values.eval(node,state.context,state.bindings),node,state,'client',false);
 };
 const visit=(node:ts.Node,state:Execution):void=>{
  const environment=envKey(graph,node);
  if(environment&&isClient(state.context)) {
   checkPrivateEnv(graph,diagnostics,node,state);
   if(environment.key&&environment.key!=='NODE_ENV'&&(environment.key.startsWith('NEXT_PUBLIC_')||graph.resolver.config.env.has(environment.key)))sink(values.eval(node,state.context,state.bindings),node,state,'client',false);
  }
  if(isClient(state.context)&&ts.isPropertyAccessExpression(node)&&node.name.text==='env'&&ts.isIdentifier(node.expression)&&node.expression.text==='process'&&unshadowed(graph,node.expression)&&!(ts.isPropertyAccessExpression(node.parent)&&node.parent.expression===node)&&!(ts.isElementAccessExpression(node.parent)&&node.parent.expression===node))diagnostics.limit('unknown-value',node,['NSG005','NSG006']);
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)) {
   const opening=ts.isJsxElement(node)?node.openingElement:node,ref=resolveReference(graph,opening.tagName);
   if(state.context!=='rsc'||ref.source?.directive!=='client')return;
   const destination=`${ref.source.file.path}#${ref.exported??'default'}`;
   const props=new Map<string,{value:Value;site:ts.Node}>();
   for(const p of opening.attributes.properties) {
    if(ts.isJsxSpreadAttribute(p)) {
     const spread=values.eval(p.expression,state.context,state.bindings);
     if(hasUnknown(spread)) { props.clear();diagnostics.limit('unknown-value',p,['NSG004','NSG005']); }
     if(spread.fields)for(const [name,v] of spread.fields)props.set(name,{value:v,site:p.expression});
    } else if(p.initializer) {
     const expr=ts.isJsxExpression(p.initializer)?p.initializer.expression:p.initializer;
     if(expr)props.set(p.name.getText(),{value:values.eval(expr,state.context,state.bindings),site:expr});
    }
   }
   if(ts.isJsxElement(node)) {
    const children=node.children.filter(c=>!ts.isJsxText(c)||c.text.trim());
    if(children.length) {
     const fields=new Map<string,Value>();
     for(const [index,child] of children.entries()) {
      const expression=ts.isJsxExpression(child)?child.expression:child;
      if(expression&&!ts.isJsxText(expression))fields.set(String(index),values.eval(expression,state.context,state.bindings));
     }
     props.set('children',{value:{serialization:'supported',origin:'react#children',sensitive:[],fields,unknown:false},site:children[0]!});
    }
   }
   for(const [name,prop] of props) {
    sink(prop.value,prop.site,state,`${destination}.${name}`,true);
    const reference=resolveReference(graph,prop.site);
    if(reference.node&&inlineServer(reference.node)&&ts.isFunctionLike(reference.node)&&'body' in reference.node&&reference.node.body) {
     const inspect=(n:ts.Node):void=>{if(n!==reference.node&&ts.isFunctionLike(n))return;if(ts.isReturnStatement(n)&&n.expression)sink(values.eval(n.expression,'server-function',state.bindings),n.expression,{...state,context:'server-function'},'client',false);ts.forEachChild(n,inspect);};
     inspect(reference.node);
    }
   }
  }
  if(ts.isReturnStatement(node)&&node.expression)returnValue(node.expression,state);
  if(isClient(state.context)&&(ts.isIdentifier(node)||ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))) {
   const ref=resolveReference(graph,node);
   if(ref.exported&&ref.source&&ref.node&&!ts.isFunctionLike(ref.node)) {
    const relevant=diagnostics.policy.sensitive.exports.some(e=>e.file===ref.source?.file.path&&e.export===ref.exported||ref.annotations?.some(annotation=>annotation.file===e.file&&annotation.name===e.export));
    if(relevant)sink(values.eval(node,state.context,state.bindings),node,state,'client',false);
   }
  }
 };
 return {visit,returnValue};
}
