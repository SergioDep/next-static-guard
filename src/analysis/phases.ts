import { checkBudget } from '../project/budget.js';
import ts from 'typescript';
import type { Context, Evidence } from '../types.js';
import type { Graph, Use } from '../graph/build.js';
import { location } from '../project/location.js';
import { resolveExport, resolveReference, unshadowed } from './symbols.js';
import { inlineServer } from '../graph/directives.js';
import { Diagnostics } from '../rules/shared.js';
import { Values } from './values.js';
import { isClient } from '../graph/contexts.js';
import { runtimeExports } from '../graph/exports.js';
import { checkServerDependency } from '../rules/NSG001.js';
import { checkClientDependency } from '../rules/NSG002.js';
import { browserGlobalRead, checkBrowserGlobal } from '../rules/NSG003.js';
import type { Value } from './values.js';
export type Phase='module'|'render'|'state-initializer'|'memo'|'effect'|'event';
export interface Execution { context:Context; phase:Phase; trace:Evidence[]; browserGuard:boolean; uncertainGuard:boolean; hops:number; stack:Set<ts.Node>; bindings:Map<ts.Node,Value> }
export interface ExecutionHooks {visit:(node:ts.Node,state:Execution)=>void; returnValue?:(node:ts.Expression,state:Execution)=>void}
export { isClient } from '../graph/contexts.js';
export function apiId(graph:Graph,node:ts.Node):string|null{return resolveReference(graph,node).api;}
function guard(graph:Graph,node:ts.Expression):boolean|null {
 while(ts.isParenthesizedExpression(node))node=node.expression;
 if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.ExclamationToken){const inner=guard(graph,node.operand);return inner===null?null:!inner;}
 if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)){const a=guard(graph,node.left),b=guard(graph,node.right);if(node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken)return a===true||b===true?true:a===false&&b===false?false:null;return a===false||b===false?false:a===true&&b===true?true:null;}
 if(!ts.isBinaryExpression(node))return null;
 const a=node.left,b=node.right;
 const checks=(x:ts.Expression,y:ts.Expression)=>ts.isTypeOfExpression(x)&&ts.isIdentifier(x.expression)&&x.expression.text==='window'&&unshadowed(graph,x.expression)&&ts.isStringLiteral(y)&&y.text==='undefined';
 if(!checks(a,b)&&!checks(b,a))return null;
 if([ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind))return true;
 if([ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken].includes(node.operatorToken.kind))return false;
 return null;
}
export function execute(graph:Graph,diagnostics:Diagnostics,hooks:ExecutionHooks):void {
 const bindingIds=new WeakMap<object,number>();let nextBindingId=0;
 const seen=new Set<string>(),values=new Values(graph,diagnostics);
 const trace=(state:Execution,node:ts.Node,symbol:string|null,kind:Evidence['kind']='api'):Evidence[]=>[...state.trace,{kind,location:location(node),symbol}];
 const walkFunction=(node:ts.Node,state:Execution,args:readonly ts.Node[]=[]):void=>{
   const resolved=resolveReference(graph,node),fn=resolved.node;
   if(resolved.uncertain){diagnostics.limit('unknown-phase',node);return;}
   if(fn&&(ts.isClassDeclaration(fn)||ts.isClassExpression(fn))){diagnostics.limit('unknown-phase',node);return;}
   if(!fn||!ts.isFunctionLike(fn)||!('body' in fn)||!fn.body)return;
   if(state.stack.has(fn)||state.hops>2){diagnostics.limit('unknown-phase',node);return;}
   const source=resolved.source;
   const context=resolved.browserOnly&&isClient(state.context)?'client-browser':source?.directive==='server'||inlineServer(fn)?'server-function':source?.directive==='client'&&!isClient(state.context)?'client-ssr':state.context;
   const bindings=new Map(state.bindings);
   for(const [index,param] of fn.parameters.entries())if(args[index])bindings.set(param,values.eval(args[index]!,state.context,state.bindings));
   const execution={...state,context,bindings,stack:new Set([...state.stack,fn])};
   walk(fn.body,execution);
   if(ts.isArrowFunction(fn)&&!ts.isBlock(fn.body))hooks.returnValue?.(fn.body,execution);
 };
 const unknownCallback=(node:ts.Node,definition=node):void=>{
   let browser=false;
   const visit=(n:ts.Node):void=>{if(ts.isIdentifier(n)&&browserGlobalRead(graph,n))browser=true;ts.forEachChild(n,visit);};visit(definition);
   if(browser)diagnostics.limit('unknown-phase',node,['NSG003']);
 };
 const walk=(node:ts.Node,state:Execution):void=>{
    checkBudget();
   if(!bindingIds.has(state.bindings))bindingIds.set(state.bindings,nextBindingId++);
   const key=`${bindingIds.get(state.bindings)}:${node.getSourceFile().fileName}:${node.pos}:${node.end}:${state.context}:${state.phase}:${state.browserGuard}`;
   if(seen.has(key))return;seen.add(key);
   hooks.visit(node,state);
   checkServerDependency(graph,diagnostics,node,state);
   checkClientDependency(graph,diagnostics,node,state);
   checkBrowserGlobal(graph,diagnostics,node,state);
   if(ts.isTypeNode(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node)||ts.isImportDeclaration(node)||ts.isExportDeclaration(node))return;
   if(ts.isFunctionLike(node))return;
   if(ts.isClassDeclaration(node)||ts.isClassExpression(node)) {
     for(const heritage of node.heritageClauses??[])if(heritage.token===ts.SyntaxKind.ExtendsKeyword)for(const type of heritage.types)walk(type.expression,state);
     for(const member of node.members) {
       if(ts.isPropertyDeclaration(member)&&member.initializer&&member.modifiers?.some(m=>m.kind===ts.SyntaxKind.StaticKeyword))walk(member.initializer,state);
       if(ts.isClassStaticBlockDeclaration(member))walk(member.body,state);
     }
     return;
   }
   if(ts.isBlock(node)||ts.isSourceFile(node)) {
     let next=state;
     for(const s of node.statements) {
       walk(s,next);
       if(ts.isIfStatement(s)) {
         const g=guard(graph,s.expression);
         const exits=ts.isReturnStatement(s.thenStatement)||(ts.isBlock(s.thenStatement)&&s.thenStatement.statements.some(v=>ts.isReturnStatement(v)));
         if(g===false&&exits)next={...next,browserGuard:true};else if(g===null&&exits)next={...next,uncertainGuard:true};
       }
     }
     return;
   }
   if(ts.isIfStatement(node)) {
     walk(node.expression,state);const g=guard(graph,node.expression);
     if(node.expression.kind===ts.SyntaxKind.TrueKeyword){walk(node.thenStatement,state);return;}if(node.expression.kind===ts.SyntaxKind.FalseKeyword){if(node.elseStatement)walk(node.elseStatement,state);return;}
     walk(node.thenStatement,{...state,browserGuard:state.browserGuard||g===true,uncertainGuard:state.uncertainGuard||g===null});
     if(node.elseStatement)walk(node.elseStatement,{...state,browserGuard:state.browserGuard||g===false,uncertainGuard:state.uncertainGuard||g===null});return;
   }
   if(ts.isConditionalExpression(node)) {
     walk(node.condition,state);const g=guard(graph,node.condition);if(node.condition.kind===ts.SyntaxKind.TrueKeyword){walk(node.whenTrue,state);return;}if(node.condition.kind===ts.SyntaxKind.FalseKeyword){walk(node.whenFalse,state);return;}walk(node.whenTrue,{...state,browserGuard:state.browserGuard||g===true,uncertainGuard:state.uncertainGuard||g===null});walk(node.whenFalse,{...state,browserGuard:state.browserGuard||g===false,uncertainGuard:state.uncertainGuard||g===null});return;
   }
   if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) {
     walk(node.left,state);if(node.left.kind===ts.SyntaxKind.FalseKeyword&&node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken||node.left.kind===ts.SyntaxKind.TrueKeyword&&node.operatorToken.kind===ts.SyntaxKind.BarBarToken)return;const g=guard(graph,node.left);walk(node.right,{...state,browserGuard:state.browserGuard||(node.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken?g===true:g===false),uncertainGuard:state.uncertainGuard||(g===null&&![ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(node.left.kind))});return;
   }
   if(ts.isNewExpression(node)) {
     const reference=resolveReference(graph,node.expression);
     if(reference.node&&(ts.isClassDeclaration(reference.node)||ts.isClassExpression(reference.node))) {
       for(const member of reference.node.members) {
         if(ts.isPropertyDeclaration(member)&&member.initializer&&!member.modifiers?.some(m=>m.kind===ts.SyntaxKind.StaticKeyword))walk(member.initializer,state);
         if(ts.isConstructorDeclaration(member)&&member.body)walkFunction(member,{...state,hops:state.hops+1},node.arguments??[]);
       }
     }
     for(const argument of node.arguments??[])walk(argument,state);
     return;
   }
   if(ts.isCallExpression(node)) {
     const called=resolveReference(graph,node.expression),api=called.api;
     if(called.uncertain)diagnostics.limit('unknown-phase',node.expression);
     walk(node.expression,state);
     const callbackPhase:Phase|null=api==='react#useEffect'||api==='react#useLayoutEffect'?'effect':api==='react#useMemo'?'memo':api==='react#useState'?'state-initializer':null;
     for(const [index,arg] of node.arguments.entries()) {
       const ref=resolveReference(graph,arg).node;
       if(index===0&&callbackPhase&&ref&&ts.isFunctionLike(ref))walkFunction(arg,{...state,phase:callbackPhase,context:callbackPhase==='effect'&&isClient(state.context)?'client-browser':state.context,trace:trace(state,arg,api,'phase')});
       else if(ref&&ts.isFunctionLike(ref))unknownCallback(arg,ref);
       else walk(arg,state);
     }
     if(!api && node.expression.kind!==ts.SyntaxKind.ImportKeyword) {
       const ref=resolveReference(graph,node.expression);
       if(ref.node&&ts.isFunctionLike(ref.node))walkFunction(node.expression,{...state,hops:state.hops+1,trace:trace(state,node,`${ref.source?.file.path??node.getSourceFile().fileName}#${ref.exported??ref.node.name?.getText()??'<anonymous>'}`,'reference')},node.arguments);
     }
     return;
   }
   if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)) {
     const opening=ts.isJsxElement(node)?node.openingElement:node, tag=opening.tagName;
     const intrinsic=ts.isIdentifier(tag)&&/^[a-z]/.test(tag.text);
     for(const attribute of opening.attributes.properties) {
       if(ts.isJsxAttribute(attribute)&&attribute.initializer&&ts.isJsxExpression(attribute.initializer)&&attribute.initializer.expression) {
         const expr=attribute.initializer.expression;
         if(isClient(state.context)&&intrinsic&&/^on[A-Z]/.test(attribute.name.getText()))walkFunction(expr,{...state,context:'client-browser',phase:'event',trace:trace(state,expr,'client#event','phase')});
         else walk(expr,state);
       } else if(ts.isJsxSpreadAttribute(attribute))walk(attribute.expression,state);
     }
     if(!intrinsic) {
       const ref=resolveReference(graph,tag),attributes=new Map<string,Value>();
       for(const attribute of opening.attributes.properties)if(ts.isJsxAttribute(attribute)&&attribute.initializer&&ts.isJsxExpression(attribute.initializer)&&attribute.initializer.expression)attributes.set(attribute.name.getText(),values.eval(attribute.initializer.expression,state.context,state.bindings));
       const bindings=new Map(state.bindings);
       if(ref.node&&ts.isFunctionLike(ref.node)&&ref.node.parameters[0])bindings.set(ref.node.parameters[0],{serialization:'supported',origin:'react#props',sensitive:[],fields:attributes,unknown:false});
       walkFunction(tag,{...state,bindings,phase:'render',trace:trace(state,tag,tag.getText(),'reference')});
     }
     if(ts.isJsxElement(node))for(const child of node.children)walk(child,state);
     return;
   }
   ts.forEachChild(node,n=>walk(n,state));
 };
 for(const use of graph.uses) {
   const state:Execution={context:use.context,phase:'module',trace:use.trace,browserGuard:false,uncertainGuard:false,hops:0,stack:new Set(),bindings:new Map()};
   walk(use.node.ast,state);
   const entry=graph.resolver.app.entries.find(e=>e.file===use.node.file.path);
   if(entry) {
     const names=entry.handler?['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS']:['default'];
     for(const name of names) {const ref=resolveExport(graph,use.node.file.path,name);if(ref.node)walkFunction(ref.node,{...state,phase:entry.handler?'module':'render'});}
   }
   if(use.node.directive==='server')for(const name of use.exports.has('*')?runtimeExports(graph.resolver,use.node.file.path).names:use.exports) {
     const reference=resolveExport(graph,use.node.file.path,name);
     if(reference.node)walkFunction(reference.node,{...state,context:'server-function'});
   }
 }
}
