import ts from 'typescript';
import type { Graph } from '../graph/build.js';
import type { SourceNode } from '../types.js';
import { runtimeExports } from '../graph/exports.js';
export interface Reference { node:ts.Node|null; source:SourceNode|null; api:string|null; exported:string|null; browserOnly?:boolean; uncertain?:boolean }
function objectMember(graph:Graph,value:Reference,member:string,seen:Set<string>):Reference {
  let property:ts.Node|undefined;
  if(value.node&&ts.isObjectLiteralExpression(value.node))for(const item of value.node.properties) {
    if(ts.isSpreadAssignment(item)||ts.isComputedPropertyName(item.name)){property=undefined;continue;}
    if((ts.isIdentifier(item.name)||ts.isStringLiteral(item.name))&&item.name.text===member)property=ts.isPropertyAssignment(item)?item.initializer:ts.isMethodDeclaration(item)?item:undefined;
  }
  return property?resolveReference(graph,property,seen):{node:null,source:value.source,api:null,exported:null,uncertain:true};
}
export function resolveExport(graph:Graph,file:string,name:string,seen=new Set<string>()):Reference {
  const key=`${file}#${name}`;if(seen.has(key))return {node:null,source:null,api:null,exported:null};seen.add(key);
  const source=graph.resolver.source(file);if(!source)return {node:null,source:null,api:null,exported:null};
  if(file.endsWith('.json')&&name==='default'&&source.ast.statements[0]&&ts.isExpressionStatement(source.ast.statements[0]))return {node:source.ast.statements[0].expression,source,api:null,exported:name};
  for(const s of source.ast.statements) {
    const exported=ts.canHaveModifiers(s)&&ts.getModifiers(s)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
    if(ts.isFunctionDeclaration(s)||ts.isClassDeclaration(s)) {
      if(exported&&((name==='default'&&s.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))||s.name?.text===name))return {node:s,source,api:null,exported:name};
    }
    if(ts.isVariableStatement(s)&&exported)for(const d of s.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.name.text===name)return {node:d.initializer??d,source,api:null,exported:name};
    if(ts.isExportAssignment(s)&&name==='default')return resolveReference(graph,s.expression,new Set(seen));
    if(ts.isExportDeclaration(s)&&!s.isTypeOnly) {
      const names=s.exportClause&&ts.isNamedExports(s.exportClause)?s.exportClause.elements.filter(e=>!e.isTypeOnly&&e.name.text===name):null;
      if(names && !names.length)continue;
      const imported=names?.[0]?.propertyName?.text??names?.[0]?.name.text??name;
      if(s.moduleSpecifier&&ts.isStringLiteral(s.moduleSpecifier)) {
        const r=graph.resolver.resolve(file,s.moduleSpecifier.text);
        if(r.package)return {node:null,source,api:`${r.package}#${imported}`,exported:name};
        if(r.file) {
          if(!s.exportClause && (name==='default'||!runtimeExports(graph.resolver,r.file).names.has(name)))continue;
          return resolveExport(graph,r.file,imported,new Set(seen));
        }
      } else if(names?.[0])return resolveReference(graph,names[0].propertyName??names[0].name,new Set(seen));
    }
  }
  return {node:null,source,api:null,exported:name};
}
function reassigned(graph:Graph,declaration:ts.VariableDeclaration,use:ts.Node):boolean {
  if(!ts.isIdentifier(declaration.name))return false;
  const symbol=graph.checker.getSymbolAtLocation(declaration.name);
  if(!symbol)return false;
  let changed=false;
  const scan=(node:ts.Node):void=>{
    if(changed || (use.getSourceFile()===node.getSourceFile() && node.pos>=use.pos))return;
    let target:ts.Node|undefined;
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment)target=node.left;
    if(ts.isPrefixUnaryExpression(node)||ts.isPostfixUnaryExpression(node))if(node.operator===ts.SyntaxKind.PlusPlusToken||node.operator===ts.SyntaxKind.MinusMinusToken)target=node.operand;
    if(target){while(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))target=target.expression;if(ts.isIdentifier(target)&&graph.checker.getSymbolAtLocation(target)===symbol)changed=true;}
    ts.forEachChild(node,scan);
  };
  scan(declaration.getSourceFile());return changed;
}
export function resolveReference(graph:Graph,node:ts.Node,seen=new Set<string>()):Reference {
  const source=graph.resolver.source(node.getSourceFile().fileName);
  // Property names belong to their object, not to the lexical scope. Avoid
  // asking the checker for their runtime type during symbol resolution.
  if(ts.isIdentifier(node)&&ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node)return {node:null,source,api:null,exported:null};
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isSatisfiesExpression(node))return resolveReference(graph,node.expression,seen);
  if(ts.isCallExpression(node)) {
    const call=resolveReference(graph,node.expression,new Set(seen));
    if(call.api==='next/dynamic#default') {
      const loader=node.arguments[0],options=node.arguments[1];
      let target:ts.Node|undefined;
      if(loader&&ts.isArrowFunction(loader))target=loader.body;
      if(target&&ts.isCallExpression(target)&&target.expression.kind===ts.SyntaxKind.ImportKeyword&&target.arguments[0]&&ts.isStringLiteral(target.arguments[0])) {
        const destination=graph.resolver.resolve(node.getSourceFile().fileName,target.arguments[0].text).file;
        const browserOnly=!!options&&ts.isObjectLiteralExpression(options)&&options.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText()==='ssr'&&p.initializer.kind===ts.SyntaxKind.FalseKeyword);
        if(destination)return {...resolveExport(graph,destination,'default',new Set(seen)),browserOnly};
      }
    }
  }
  if(ts.isFunctionLike(node)||ts.isClassDeclaration(node))return {node,source,api:null,exported:null};
  let name:string|null=null, member:string|null=null;
  if(ts.isIdentifier(node))name=node.text;
  else if(ts.isPropertyAccessExpression(node)&&ts.isIdentifier(node.expression)){name=node.expression.text;member=node.name.text;}
  else if(ts.isElementAccessExpression(node)&&ts.isIdentifier(node.expression)&&ts.isStringLiteral(node.argumentExpression)){name=node.expression.text;member=node.argumentExpression.text;}
  if(name) {
    const symbol=ts.isIdentifier(node)&&ts.isExportSpecifier(node.parent)&&!node.parent.parent.parent.moduleSpecifier
      ?graph.checker.getExportSpecifierLocalTargetSymbol(node.parent)
      :graph.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)?node.expression:node);
    const declaration=symbol?.valueDeclaration??symbol?.declarations?.[0];
    const binding=graph.bindings.get(node.getSourceFile().fileName)?.get(name);
    const imported=declaration&&(ts.isImportSpecifier(declaration)||ts.isImportClause(declaration)||ts.isNamespaceImport(declaration));
    if(binding && (!declaration||imported)) {
      if(member&&binding.imported!=='*'&&binding.imported!=='default')return {node,source,api:null,exported:null};
      const exported=member??binding.imported;
      if(binding.resolution.package)return {node:null,source,api:`${binding.resolution.package}#${exported}`,exported};
      if(binding.resolution.file&&member&&binding.imported==='default')return objectMember(graph,resolveExport(graph,binding.resolution.file,'default',new Set(seen)),member,seen);
      if(binding.resolution.file)return resolveExport(graph,binding.resolution.file,exported,seen);
    }
    if(declaration) {
      const key=`${declaration.getSourceFile().fileName}:${declaration.pos}`;if(seen.has(key))return {node:null,source,api:null,exported:null};seen.add(key);
      if(ts.isVariableDeclaration(declaration)&&declaration.initializer) {
        if(reassigned(graph,declaration,node))return {node:null,source,api:null,exported:null,uncertain:true};
        const value=resolveReference(graph,declaration.initializer,seen);
        return member?objectMember(graph,value,member,seen):value;
      }
      return {node:declaration,source:graph.resolver.source(declaration.getSourceFile().fileName),api:null,exported:null};
    }
  }
  return {node,source,api:null,exported:null};
}
export function unshadowed(graph:Graph,node:ts.Identifier):boolean {
  const symbol=graph.checker.getSymbolAtLocation(node);
  return !symbol?.declarations?.some(d=>graph.resolver.snapshot.files.has(d.getSourceFile().fileName));
}
