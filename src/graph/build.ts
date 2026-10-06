import { checkBudget } from '../project/budget.js';
import { GuardError } from '../cli/errors.js';
import ts from 'typescript';
import { posix } from 'node:path';
import type { Context, Evidence, Limit, SourceNode } from '../types.js';
import { RULE_IDS } from '../types.js';
import { location } from '../project/location.js';
import { Resolver } from '../project/resolve.js';
import type { Resolution } from '../project/resolve.js';
import { propagateContexts } from './contexts.js';
import { isAsyncFunction } from './directives.js';
import { runtimeExports } from './exports.js';
export interface ImportBinding {local:string; imported:string; specifier:string; declaration:ts.ImportDeclaration; resolution:Resolution}
export interface Use {node:SourceNode; context:Context; trace:Evidence[]; exports:Set<string>}
export interface Graph {resolver:Resolver; uses:Use[]; bindings:Map<string,Map<string,ImportBinding>>; limits:Limit[]; edgeCount:number; program:ts.Program; checker:ts.TypeChecker}
export function typePosition(node:ts.Node):boolean {
  for(let p:ts.Node|undefined=node.parent;p;p=p.parent) {
    if(ts.isTypeNode(p)||ts.isInterfaceDeclaration(p)||ts.isTypeAliasDeclaration(p))return true;
    if(ts.isExpression(p)||ts.isStatement(p)||ts.isSourceFile(p))break;
  }
  return false;
}
function bindingName(name:ts.BindingName,wanted:string):boolean {
  return ts.isIdentifier(name)?name.text===wanted:name.elements.some(element=>!ts.isOmittedExpression(element)&&bindingName(element.name,wanted));
}
function shadowedReference(node:ts.Identifier,name:string):boolean {
  for(let scope:ts.Node|undefined=node.parent;scope;scope=scope.parent) {
    if(ts.isFunctionLike(scope)) {
      if(scope.parameters.some(parameter=>bindingName(parameter.name,name)))return true;
      if(scope.name&&ts.isIdentifier(scope.name)&&scope.name.text===name)return true;
      if('body' in scope&&scope.body) {
        const body=scope.body;let hoisted=false;
        const visit=(part:ts.Node):void=>{if(part!==body&&ts.isFunctionLike(part))return;if(ts.isVariableDeclarationList(part)&&!(part.flags&(ts.NodeFlags.Let|ts.NodeFlags.Const))&&part.declarations.some(d=>bindingName(d.name,name)))hoisted=true;ts.forEachChild(part,visit);};
        visit(scope.body);if(hoisted)return true;
      }
    }
    if(ts.isCatchClause(scope)&&scope.variableDeclaration&&bindingName(scope.variableDeclaration.name,name))return true;
    if((ts.isForStatement(scope)||ts.isForInStatement(scope)||ts.isForOfStatement(scope))&&scope.initializer&&ts.isVariableDeclarationList(scope.initializer)&&scope.initializer.declarations.some(d=>bindingName(d.name,name)))return true;
    if(ts.isBlock(scope)||ts.isSourceFile(scope))for(const statement of scope.statements) {
      if(ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(d=>bindingName(d.name,name)))return true;
      if((ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement))&&statement.name?.text===name)return true;
    }
  }
  return false;
}
export function runtimeUsed(ast:ts.SourceFile, name:string):boolean {
  let used=false;
  const visit=(n:ts.Node):void=>{
    if(used||ts.isImportDeclaration(n))return;
    if(ts.isExportDeclaration(n)&&n.isTypeOnly)return;
    if(ts.isIdentifier(n) && n.text===name && !typePosition(n)) {
      const parent=n.parent;
      if(ts.isExportSpecifier(parent)) {
        if(!parent.isTypeOnly&&(parent.propertyName??parent.name)===n)used=true;
      } else if(!((ts.isPropertyAccessExpression(parent)&&parent.name===n)||(ts.isPropertyAssignment(parent)&&parent.name===n)||('name' in parent&&parent.name===n&&!ts.isShorthandPropertyAssignment(parent)))&&!shadowedReference(n,name))used=true;
    }
    ts.forEachChild(n,visit);
  };visit(ast);return used;
}
export function retainsBinding(ast:ts.SourceFile,name:string,verbatimModuleSyntax:boolean):boolean {
  return !/\.tsx?$/.test(ast.fileName)||verbatimModuleSyntax||runtimeUsed(ast,name);
}
function validServerModule(node:SourceNode,resolver:Resolver,seen=new Set<string>()):boolean {
  if(seen.has(node.file.path))return false;seen.add(node.file.path);
  let count=0;
  const localFunctions=new Map<string,ts.Node>();
  for(const statement of node.ast.statements) {
    if(ts.isFunctionDeclaration(statement)&&statement.name)localFunctions.set(statement.name.text,statement);
    if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name)&&declaration.initializer)localFunctions.set(declaration.name.text,declaration.initializer);
  }
  for(const statement of node.ast.statements) {
    if(ts.isExportDeclaration(statement)) {
      if(statement.isTypeOnly)continue;
      if(!statement.moduleSpecifier) {
        if(!statement.exportClause||!ts.isNamedExports(statement.exportClause))return false;
        for(const entry of statement.exportClause.elements)if(!entry.isTypeOnly) {
          const value=localFunctions.get(entry.propertyName?.text??entry.name.text);
          if(!value||!isAsyncFunction(value))return false;count++;
        }
        continue;
      }
      if(!ts.isStringLiteral(statement.moduleSpecifier))return false;
      const destination=resolver.resolve(node.file.path,statement.moduleSpecifier.text).file;
      const source=destination?resolver.source(destination):null;
      if(!source || source.directive!=='server' || !validServerModule(source,resolver,new Set(seen)))return false;
      count++;continue;
    }
    const exported=ts.canHaveModifiers(statement)&&ts.getModifiers(statement)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
    if(!exported)continue;
    if(ts.isTypeAliasDeclaration(statement)||ts.isInterfaceDeclaration(statement))continue;
    if(isAsyncFunction(statement)){count++;continue;}
    if(ts.isVariableStatement(statement)) {
      for(const d of statement.declarationList.declarations)if(!d.initializer||!isAsyncFunction(d.initializer))return false;else count++;
      continue;
    }
    if(ts.isExportAssignment(statement)&&(isAsyncFunction(statement.expression)||ts.isIdentifier(statement.expression)&&!!localFunctions.get(statement.expression.text)&&isAsyncFunction(localFunctions.get(statement.expression.text)!))){count++;continue;}
    return false;
  }
  return count>0;
}
export function buildGraph(resolver:Resolver):Graph {
  const uses:Use[]=[],bindings=new Map<string,Map<string,ImportBinding>>(),limits:Limit[]=[], queue:{file:string;context:Context;trace:Evidence[];names:string[];browserOnly?:boolean}[]=[], visited=new Map<string,Use>();
  let edgeCount=0;
  const limit=(code:Limit['code'],node:ts.Node|null,file:string|null,affectedRules=[...RULE_IDS]):void=>{limits.push({code,location:node?location(node,file??undefined):null,affectedRules,snapshot:resolver.snapshot.kind,projectRoot:resolver.app.root});};
  const requiredMetadata=new Set(resolver.metadataPaths);
  let directory=resolver.app.root;
  while(true) {
    for(const name of ['package.json','package-lock.json'])requiredMetadata.add(posix.join(directory,name));
    if(directory==='.')break;directory=posix.dirname(directory);
  }
  for(const path of requiredMetadata) {
    const failure=resolver.snapshot.failures.get(path);if(failure)limits.push({code:failure,location:{file:path,start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0}},affectedRules:[...RULE_IDS],snapshot:resolver.snapshot.kind,projectRoot:resolver.app.root});
  }
  const supported=resolver.app.versions.nextVersion==='16.3.8'&&resolver.app.versions.reactVersion==='19.3.0'&&resolver.app.versions.reactDomVersion==='19.3.0';
  if(!supported){const manifest=resolver.source(`${resolver.app.root==='.'?'':resolver.app.root+'/'}package.json`);limit('unsupported-version',manifest?.ast??null,null);}
  else {
    if(resolver.config.dynamic) {const config=resolver.config.configFile?resolver.source(resolver.config.configFile):null;limit('dynamic-config',config?.ast??null,null);}
    for(const entry of resolver.app.entries)queue.push({file:entry.file,context:entry.handler?'server-handler':'rsc',trace:[],names:['*']});
  }
  while(queue.length) {
    checkBudget();
    const item=queue.shift()!, node=resolver.source(item.file);
    if(!node){limit(resolver.snapshot.failures.get(item.file)??'source-excluded',null,item.file);continue;}
    if(node.invalidDirective || (node.directive==='server'&&!validServerModule(node,resolver))) {limit('unsupported-syntax',node.ast,node.file.path);continue;}
    const diagnostics=(node.ast as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics;
    if(diagnostics.length){limit('unsupported-syntax',node.ast,node.file.path);continue;}
    if(resolver.app.entries.some(e=>e.file===item.file&&e.clientRequired)&&node.directive!=='client'){limit('unsupported-syntax',node.ast,node.file.path);continue;}
    const contexts=propagateContexts(node.directive,item.context,item.browserOnly);
    for(const context of contexts) {
      const key=`${node.file.path}:${context}`, previous=visited.get(key);
      if(previous && item.names.every(n=>previous.exports.has(n)||previous.exports.has('*')))continue;
      const use:Use=previous??{node,context,trace:item.trace,exports:new Set<string>()};
      item.names.forEach(n=>use.exports.add(n));if(!previous){visited.set(key,use);uses.push(use);}
      const table=bindings.get(node.file.path)??new Map<string,ImportBinding>();bindings.set(node.file.path,table);
      for(const statement of node.ast.statements) {
        if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)) {
          const clause=statement.importClause;if(clause?.isTypeOnly)continue;
          const resolution=resolver.resolve(node.file.path,statement.moduleSpecifier.text), imported:{local:string;imported:string}[]=[];
          if(clause?.name)imported.push({local:clause.name.text,imported:'default'});
          if(clause?.namedBindings) {
            if(ts.isNamespaceImport(clause.namedBindings))imported.push({local:clause.namedBindings.name.text,imported:'*'});
            else for(const e of clause.namedBindings.elements)if(!e.isTypeOnly)imported.push({local:e.name.text,imported:e.propertyName?.text??e.name.text});
          }
          for(const e of imported)table.set(e.local,{...e,specifier:statement.moduleSpecifier.text,declaration:statement,resolution});
          const retained=imported.filter(e=>retainsBinding(node.ast,e.local,resolver.config.verbatimModuleSyntax));
          if(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.length&&!imported.length)continue;
          if(clause&&!retained.length&&/\.tsx?$/.test(node.file.path)&&!resolver.config.verbatimModuleSyntax)continue;
          edgeCount++;
          const trace=[...use.trace,{kind:'import' as const,location:location(statement),symbol:statement.moduleSpecifier.text}];
          if(resolution.limit)limit(resolution.limit,statement,node.file.path);
          else if(resolution.file)queue.push({file:resolution.file,context,trace,names:clause?retained.filter(e=>runtimeUsed(node.ast,e.local)).map(e=>e.imported):['*']});
        } else if(ts.isExportDeclaration(statement)&&!statement.isTypeOnly&&statement.moduleSpecifier&&ts.isStringLiteral(statement.moduleSpecifier)) {
          const resolved=resolver.resolve(node.file.path,statement.moduleSpecifier.text);
          let names=statement.exportClause&&ts.isNamedExports(statement.exportClause)?statement.exportClause.elements.filter(e=>!e.isTypeOnly&&(use.exports.has('*')||use.exports.has(e.name.text))).map(e=>e.propertyName?.text??e.name.text):['*'];
          if(!statement.exportClause && !use.exports.has('*')) {
            if(resolved.file) {
              const exports=runtimeExports(resolver,resolved.file);
              names=[...use.exports].filter(name=>name!=='default'&&exports.names.has(name));
              if(exports.unknown)limit('uncertain-runtime',statement,node.file.path);
            } else {if(!resolved.package)limit('uncertain-runtime',statement,node.file.path);names=[];}
          }
          if(statement.exportClause&&ts.isNamedExports(statement.exportClause)&&statement.exportClause.elements.length&&statement.exportClause.elements.every(e=>e.isTypeOnly))continue;
          edgeCount++;
          if(resolved.limit)limit(resolved.limit,statement,node.file.path);
          else if(resolved.file)queue.push({file:resolved.file,context,trace:[...use.trace,{kind:'import',location:location(statement),symbol:statement.moduleSpecifier.text}],names});
        }
      }
      const dynamic=(n:ts.Node):void=>{
        if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword) {
          const arg=n.arguments[0];
          if(!arg||!ts.isStringLiteralLike(arg)||/\/\*.*(?:webpack|turbopack)/s.test(n.getFullText()))limit('unresolved-import',n,node.file.path);
          else {
            const resolved=resolver.resolve(node.file.path,arg.text);edgeCount++;
            if(resolved.limit)limit(resolved.limit,n,node.file.path);
            else if(resolved.file) {
              let owner:ts.Node|undefined=n.parent,browserOnly=false;
              while(owner&&!ts.isStatement(owner)) {
                if(ts.isCallExpression(owner)&&ts.isIdentifier(owner.expression)) {
                  const binding=table.get(owner.expression.text),options=owner.arguments[1];
                  if(binding?.resolution.package==='next/dynamic'&&options&&ts.isObjectLiteralExpression(options)&&options.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText()==='ssr'&&p.initializer.kind===ts.SyntaxKind.FalseKeyword))browserOnly=true;
                }
                owner=owner.parent;
              }
              if(browserOnly&&context==='rsc')limit('unknown-phase',n,node.file.path,['NSG003']);
              else queue.push({file:resolved.file,context:browserOnly?'client-browser':context,trace:[...use.trace,{kind:'import',location:location(n),symbol:arg.text}],names:['*'],browserOnly});
            }
          }
        }
        ts.forEachChild(n,dynamic);
      };dynamic(node.ast);
    }
    if(resolver.nodes.size>50_000||[...resolver.nodes.values()].reduce((sum,n)=>sum+n.file.bytes,0)>512*1024*1024){limit('source-budget',null,null);break;}
  }
  const host:ts.CompilerHost={getSourceFile:(f)=>resolver.source(f)?.ast, getDefaultLibFileName:()=>'',writeFile:()=>{throw new GuardError('Read-only analysis host.');},getCurrentDirectory:()=>'',getDirectories:()=>[],fileExists:f=>resolver.snapshot.files.has(f),readFile:f=>resolver.snapshot.files.get(f)?.text,getCanonicalFileName:f=>f,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n',resolveModuleNames:(names,from)=>names.map(name=>{const file=resolver.resolve(from,name).file;return file?{resolvedFileName:file,extension:file.endsWith('.tsx')?ts.Extension.Tsx:file.endsWith('.ts')?ts.Extension.Ts:file.endsWith('.jsx')?ts.Extension.Jsx:ts.Extension.Js}:undefined;})};
  const program=ts.createProgram([...resolver.nodes.keys()],{allowJs:true,jsx:ts.JsxEmit.Preserve,noEmit:true,noLib:true,noResolve:true,types:[]},host);
  return {resolver,uses,bindings,limits,edgeCount,program,checker:program.getTypeChecker()};
}
