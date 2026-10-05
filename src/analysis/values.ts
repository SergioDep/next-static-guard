import { checkBudget } from '../project/budget.js';
import ts from 'typescript';
import type { Category, Context } from '../types.js';
import type { Graph } from '../graph/build.js';
import { inlineServer } from '../graph/directives.js';
import { resolveReference, unshadowed } from './symbols.js';
import { Diagnostics } from '../rules/shared.js';
export interface Origin { id:string; category:Category }
export interface Value { serialization:'supported'|'rejected'|'unknown'; origin:string; sensitive:Origin[]; fields:Map<string,Value>|null; unknown:boolean }
const value=(serialization:Value['serialization']='supported',origin='value',fields:Map<string,Value>|null=null,sensitive:Origin[]=[],unknown=false):Value=>({serialization,origin,fields,sensitive,unknown});
export function unknown(origin='unknown'):Value{return value('unknown',origin,null,[],true);}
export function envKey(graph:Graph,node:ts.Node):{key:string|null;dynamic:boolean}|null {
 if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)) {
  const env=node.expression;
  if(ts.isPropertyAccessExpression(env)&&env.name.text==='env'&&ts.isIdentifier(env.expression)&&env.expression.text==='process'&&unshadowed(graph,env.expression)) {
   return {key:ts.isPropertyAccessExpression(node)?node.name.text:node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression)?node.argumentExpression.text:null,dynamic:ts.isElementAccessExpression(node)&&!ts.isStringLiteralLike(node.argumentExpression)};
  }
 }
 return null;
}
export function allOrigins(v:Value):Origin[]{return [...v.sensitive,...(v.fields?[...v.fields.values()].flatMap(allOrigins):[])];}
export function rejected(v:Value):Value|null {if(v.serialization==='rejected')return v;if(v.fields)for(const child of v.fields.values()){const bad=rejected(child);if(bad)return bad;}return null;}
export function hasUnknown(v:Value):boolean{return v.unknown||v.serialization==='unknown'||!!v.fields&&[...v.fields.values()].some(hasUnknown);}
export class Values {
 constructor(readonly graph:Graph,readonly diagnostics:Diagnostics) {}
 eval(node:ts.Node,context:Context,bindings=new Map<ts.Node,Value>(),depth=0,seen=new Set<ts.Node>(),calls=0):Value {
  checkBudget();
  if(depth>64){this.diagnostics.limit('source-budget',node,['NSG004','NSG005']);return unknown();}
  if(calls>2 || seen.has(node))return unknown();
  seen=new Set([...seen,node]);
  const recur=(n:ts.Node)=>this.eval(n,context,bindings,depth+1,new Set(seen),calls);
  const environment=envKey(this.graph,node);
  if(environment) {
   if(!environment.key)return unknown();
   const declared=this.diagnostics.policy.sensitive.env.find(e=>e.name===environment.key);
   const publicKey=environment.key.startsWith('NEXT_PUBLIC_')||this.graph.resolver.config.env.has(environment.key);
   return value('supported',`env#${environment.key}`,null,declared&&(!context.startsWith('client-')||publicKey)?[{id:`env#${environment.key}`,category:declared.category}]:[]);
  }
  if(ts.isStringLiteralLike(node)||ts.isNumericLiteral(node)||ts.isBigIntLiteral(node)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind))return value();
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isSatisfiesExpression(node)||ts.isNonNullExpression(node))return recur(node.expression);
  if(ts.isAwaitExpression(node))return recur(node.expression);
  if(ts.isFunctionLike(node)) {
   const source=this.graph.resolver.source(node.getSourceFile().fileName);
   return value(source?.directive==='server'||source?.directive==='client'||inlineServer(node)?'supported':'rejected',`${node.getSourceFile().fileName}#${node.name?.getText()??'<function>'}`);
  }
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)||ts.isJsxFragment(node))return value('supported','react#element');
  if(ts.isIdentifier(node)) {
   if(['undefined','NaN','Infinity'].includes(node.text)&&unshadowed(this.graph,node))return value();
   const symbol=this.graph.checker.getSymbolAtLocation(node),declaration=symbol?.valueDeclaration??symbol?.declarations?.[0];
   if(declaration&&bindings.has(declaration))return bindings.get(declaration)!;
   if(declaration&&ts.isBindingElement(declaration)) {
    const pattern=declaration.parent,parent=pattern.parent;
    const base=ts.isParameter(parent)?bindings.get(parent):ts.isVariableDeclaration(parent)&&parent.initializer?recur(parent.initializer):undefined;
    if(base) {
     const key=declaration.propertyName?.getText()??declaration.name.getText();
     return base.fields?.get(key)??unknown();
    }
   }
   const reference=resolveReference(this.graph,node);
   if(reference.node&&reference.node!==node) {
    const v=recur(reference.node);
    // A mutation before this use invalidates the value instead of guessing its effect.
    if(declaration&&ts.isVariableDeclaration(declaration)) {
     let mutated=false;
     const search=(n:ts.Node):void=>{
      if(n.getStart()>=node.getStart())return;
      if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment) {
       let target=n.left;while(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))target=target.expression;
       if(ts.isIdentifier(target)&&this.graph.checker.getSymbolAtLocation(target)===symbol)mutated=true;
      }
      ts.forEachChild(n,search);
     };search(node.getSourceFile());if(mutated)return unknown(v.origin);
    }
    const file=reference.source?.file.path;
    const exportName=reference.exported??(declaration&&ts.isVariableDeclaration(declaration)&&ts.isIdentifier(declaration.name)?declaration.name.text:null);
    return this.decorate(v,file??node.getSourceFile().fileName,exportName);
   }
   if(declaration&&ts.isParameter(declaration))return unknown(`${node.getSourceFile().fileName}#${node.text}`);
   return unknown();
  }
  if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)) {
   const ref=resolveReference(this.graph,node);
   if(ref.node&&ref.node!==node&&ref.exported)return this.decorate(recur(ref.node),ref.source?.file.path??node.getSourceFile().fileName,ref.exported);
   const base=recur(node.expression),key=ts.isPropertyAccessExpression(node)?node.name.text:node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression)?node.argumentExpression.text:null;
   if(key!==null&&base.fields)return base.fields.get(key)??value();
   return unknown(base.origin);
  }
  if(ts.isObjectLiteralExpression(node)) {
   const fields=new Map<string,Value>();let uncertain=false,prototypeRejected=false;
   for(const p of node.properties) {
    if(ts.isSpreadAssignment(p)) {
     const spread=recur(p.expression);if(!spread.fields){uncertain=true;continue;}
     for(const [k,v] of spread.fields)fields.set(k,v);
    } else if(ts.isPropertyAssignment(p)&&!ts.isComputedPropertyName(p.name)) {
     const key=p.name.getText().replace(/^['"]|['"]$/g,'');
     if(key==='__proto__') {
      if(p.initializer.kind===ts.SyntaxKind.NullKeyword||ts.isObjectLiteralExpression(p.initializer)||ts.isNewExpression(p.initializer))prototypeRejected=true;
      else if(!(ts.isStringLiteralLike(p.initializer)||ts.isNumericLiteral(p.initializer)))uncertain=true;
     } else fields.set(key,recur(p.initializer));
    }
    else if(ts.isShorthandPropertyAssignment(p))fields.set(p.name.text,recur(p.name));
    else if(ts.isMethodDeclaration(p))fields.set(p.name.getText(),value('rejected',`${node.getSourceFile().fileName}#${p.name.getText()}`));
    else uncertain=true;
   }
   return value(prototypeRejected?'rejected':'supported',`${node.getSourceFile().fileName}#object`,fields,[],uncertain);
  }
  if(ts.isArrayLiteralExpression(node)) {
   const fields=new Map<string,Value>();let index=0,uncertain=false;
   for(const element of node.elements) {
    if(ts.isSpreadElement(element)){const spread=recur(element.expression);if(spread.fields)for(const v of spread.fields.values())fields.set(String(index++),v);else uncertain=true;}
    else fields.set(String(index++),ts.isOmittedExpression(element)?value():recur(element));
   }
   return value('supported',`${node.getSourceFile().fileName}#array`,fields,[],uncertain);
  }
  if(ts.isNewExpression(node)) {
   const name=ts.isIdentifier(node.expression)?node.expression.text:null,args=node.arguments??[];
   if(name&&ts.isIdentifier(node.expression)&&unshadowed(this.graph,node.expression)) {
    if(['Date','ArrayBuffer','Uint8Array','Uint16Array','Uint32Array','Int8Array','Int16Array','Int32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array','DataView'].includes(name))return value('supported',`global#${name}`,new Map(args.map((a,i)=>[String(i),recur(a)])));
    if(['Map','Set','Array'].includes(name))return value('supported',`global#${name}`,new Map(args.map((a,i)=>[String(i),recur(a)])));
   }
   const ref=resolveReference(this.graph,node.expression);
   if(ref.node&&ts.isClassDeclaration(ref.node))return value('rejected',`${ref.source?.file.path}#${ref.node.name?.text??'class'}`);
   return unknown();
  }
  if(ts.isCallExpression(node)) {
   const e=node.expression,args=node.arguments;
   if(ts.isIdentifier(e)&&unshadowed(this.graph,e)) {
    if(e.text==='Symbol')return value('rejected','global#Symbol');
    if(['String','Number','Boolean','BigInt'].includes(e.text)) {const input=args[0]?recur(args[0]):value();return hasUnknown(input)?unknown():value('supported',input.origin,null,allOrigins(input));}
   }
   if(ts.isPropertyAccessExpression(e)&&ts.isIdentifier(e.expression)&&unshadowed(this.graph,e.expression)) {
    const api=`${e.expression.text}.${e.name.text}`;
    if(api==='Symbol.for')return value();
    if(api==='Object.create'&&args[0]?.kind===ts.SyntaxKind.NullKeyword)return value('rejected','global#Object.create');
    if(api==='Promise.resolve')return args[0]?recur(args[0]):value();
   }
   const ref=resolveReference(this.graph,e);
   if(ref.node&&ts.isFunctionLike(ref.node)&&'body' in ref.node&&ref.node.body) {
    if(calls>=2)return unknown();
    const fn=ref.node,newBindings=new Map(bindings);
    for(const [index,param] of fn.parameters.entries())newBindings.set(param,args[index]?recur(args[index]!):value());
    if(!ts.isBlock(fn.body!))return this.eval(fn.body!,context,newBindings,depth+1,new Set(seen),calls+1);
    const returns:ts.Expression[]=[];
    const visit=(n:ts.Node):void=>{if(n!==fn.body&&ts.isFunctionLike(n))return;if(ts.isReturnStatement(n)&&n.expression)returns.push(n.expression);ts.forEachChild(n,visit);};visit(fn.body!);
    if(returns.length===1)return this.eval(returns[0]!,context,newBindings,depth+1,new Set(seen),calls+1);
    return unknown();
   }
   return unknown();
  }
  if(ts.isConditionalExpression(node)) {
   if(node.condition.kind===ts.SyntaxKind.TrueKeyword)return recur(node.whenTrue);
   if(node.condition.kind===ts.SyntaxKind.FalseKeyword)return recur(node.whenFalse);
   const a=recur(node.whenTrue),b=recur(node.whenFalse),origins=allOrigins(a).filter(o=>allOrigins(b).some(v=>v.id===o.id&&v.category===o.category));
   return value(a.serialization===b.serialization?a.serialization:'unknown',a.origin===b.origin?a.origin:'conditional',null,origins,hasUnknown(a)||hasUnknown(b)||allOrigins(a).length!==origins.length||allOrigins(b).length!==origins.length);
  }
  if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.AsteriskToken,ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind)) {
   const a=recur(node.left),b=recur(node.right);return hasUnknown(a)||hasUnknown(b)?unknown():value('supported',a.origin,null,[...allOrigins(a),...allOrigins(b)]);
  }
  return unknown();
 }
 private decorate(v:Value,file:string,exportName:string|null):Value {
  if(!exportName)return v;
  const clone=(input:Value):Value=>({...input,sensitive:[...input.sensitive],fields:input.fields?new Map([...input.fields].map(([k,child])=>[k,clone(child)])):null});
  v=clone(v);
  for(const declaration of this.diagnostics.policy.sensitive.exports)if(declaration.file===file&&declaration.export===exportName) {
   let target=v;for(const field of declaration.field) {if(!target.fields?.has(field)){v.unknown=true;target=unknown();break;}target=target.fields.get(field)!;}
   target.sensitive.push({id:`${file}#${exportName}${JSON.stringify(declaration.field)}`,category:declaration.category});
  }
  return v;
 }
}
