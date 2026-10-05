import { posix } from 'node:path';
import ts from 'typescript';
import type { LimitCode, ProjectSnapshot, SourceNode } from '../types.js';
import type { App } from './discover.js';
import { workspaces } from './discover.js';
import { excluded, inside, relativePath } from './snapshot.js';
import type { Policy } from '../types.js';
import { directives } from '../graph/directives.js';
import { parseSource } from './parse.js';
export const KNOWN_PACKAGES = new Set(['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom','next','next/headers','next/cache','next/navigation','next/link','next/image','next/font/google','next/font/local','next/dynamic','server-only','client-only','fs','node:fs','fs/promises','node:fs/promises']);
export interface Resolution {file:string|null; package:string|null; resource:boolean; limit:LimitCode|null}
export interface RuntimeConfig { env: Map<string, ts.Node>; dynamic:boolean; paths:Record<string,string[]>; baseUrl:string|null; nodeNext:boolean; verbatimModuleSyntax:boolean; configFile:string|null }
function literal(node:ts.Expression, constants:Map<string,ts.Expression>, seen = new Set<string>()): unknown {
  if (ts.isIdentifier(node)) {if(seen.has(node.text)) return undefined;seen.add(node.text);const v=constants.get(node.text);return v?literal(v,constants,seen):undefined;}
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression,constants,seen);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(e=>literal(e,constants,new Set(seen)));
  if (ts.isObjectLiteralExpression(node)) {
    const data:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
    for(const p of node.properties) {
      if (!ts.isPropertyAssignment(p) || !p.name || ts.isComputedPropertyName(p.name)) return undefined;
      const name = p.name.getText().replace(/^['"]|['"]$/g,'');
      if(name==='__proto__')continue;
      const value=literal(p.initializer,constants,new Set(seen));if(value===undefined)return undefined;data[name]=value;
    }
    return data;
  }
  return undefined;
}
export class Resolver {
  readonly nodes = new Map<string,SourceNode>();
  readonly readRequests = new Set<string>();
  readonly metadataPaths = new Set<string>();
  readonly config:RuntimeConfig;
  readonly workspaceMap;
  constructor(readonly snapshot:ProjectSnapshot, readonly app:App, readonly policy:Policy) {
    this.workspaceMap=workspaces(snapshot);
    this.config=this.loadConfig();
  }
  source(path:string):SourceNode|null {
    path=this.snapshot.aliases.get(path) ?? path;
    const cached=this.nodes.get(path);if(cached)return cached;
    const file=this.snapshot.files.get(path);if(!file)return null;
    if (/\.(?:cjs|cts|mts|d\.ts)$/.test(path))return null;
    const {ast,failed}=parseSource(path,file.text,path.endsWith('.json')?ts.ScriptKind.JSON:undefined);
    const boundary=directives(ast);
    const node={file,ast,directive:boundary.directive,invalidDirective:boundary.invalid||failed};this.nodes.set(path,node);return node;
  }
  private candidates(path:string):string[] {
    if(this.config?.nodeNext && path.endsWith('.js'))return [path.slice(0,-3)+'.ts',path.slice(0,-3)+'.tsx',path];
    if(this.config?.nodeNext && path.endsWith('.mjs'))return [path.slice(0,-4)+'.mts',path];
    if(posix.extname(path))return [path];
    const extensions=['.tsx','.ts','.jsx','.js','.mjs','.json'];return [path,...extensions.map(e=>path+e),...extensions.map(e=>posix.join(path,'index'+e))];
  }
  private local(path:string):Resolution|null {
    path=posix.normalize(path).replace(/^\.\//,'');
    for(const [alias,target] of [...this.snapshot.aliases].sort(([a],[b])=>b.length-a.length))if(path===alias||path.startsWith(alias+'/')){path=target+path.slice(alias.length);break;}
    const unreadable=[...this.snapshot.failures].find(([failed])=>path===failed||path.startsWith(failed+'/'));if(unreadable)return {file:null,package:null,resource:false,limit:unreadable[1]};
    if(path.startsWith('../') || path==='..' || path.startsWith('/'))return {file:null,package:null,resource:false,limit:'source-excluded'};
    for(let candidate of this.candidates(path)) {
      const exists=this.snapshot.inventory.has(candidate) || this.snapshot.aliases.has(candidate);
      if(excluded(candidate,this.policy))return {file:null,package:null,resource:false,limit:'source-excluded'};
      if(!exists)continue;
      candidate=this.snapshot.aliases.get(candidate)??candidate;
      const failure=this.snapshot.failures.get(candidate);if(failure)return {file:null,package:null,resource:false,limit:failure};
      if(/\.(?:mts|cjs|cts)$/.test(candidate))return {file:null,package:null,resource:false,limit:'unsupported-syntax'};
      if(candidate.endsWith('.d.ts'))return {file:null,package:null,resource:false,limit:'uncertain-runtime'};
      return {file:candidate,package:null,resource:false,limit:null};
    }
    return null;
  }
  resolve(from:string,specifier:string):Resolution {
    if(KNOWN_PACKAGES.has(specifier))return {file:null,package:specifier,resource:false,limit:null};
    if(/\.(?:css|scss|sass|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/.test(specifier))return {file:null,package:null,resource:true,limit:null};
    if(specifier.startsWith('/'))return inside(this.snapshot.root,specifier)?this.local(relativePath(this.snapshot.root,specifier))??{file:null,package:null,resource:false,limit:'unresolved-import'}:{file:null,package:null,resource:false,limit:'source-excluded'};
    if(specifier.startsWith('.'))return this.local(posix.join(posix.dirname(from),specifier))??{file:null,package:null,resource:false,limit:'unresolved-import'};
    const exact=this.config.paths[specifier];
    const patterns=Object.keys(this.config.paths).filter(p=>p.includes('*') && p.split('*').length===2).sort((a,b)=>b.indexOf('*')-a.indexOf('*') || a.localeCompare(b,'en'));
    const pattern=exact?specifier:patterns.find(p=>specifier.startsWith(p.split('*')[0]!) && specifier.endsWith(p.split('*')[1]!));
    if(pattern) {
      const match=pattern.includes('*')?specifier.slice(pattern.indexOf('*'),specifier.length-(pattern.split('*')[1]?.length??0)):'';
      for(const target of this.config.paths[pattern]??[]) {const resolved=this.local(target.replace('*',match));if(resolved)return resolved;}
    }
    if(this.config.baseUrl) {const resolved=this.local(posix.join(this.config.baseUrl,specifier));if(resolved)return resolved;}
    const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0]!;
    const workspace=this.workspaceMap.get(name);
    if(workspace) {
      if(!workspace.root || workspace.manifest['browser'])return {file:null,package:null,resource:false,limit:'conditional-resolution'};
      const sub=specifier.slice(name.length), exports=workspace.manifest['exports'];
      let target:unknown;
      if(exports!==undefined) {
        if(typeof exports==='string')target=sub?undefined:exports;
        else if(exports && typeof exports==='object') {
          const object=exports as Record<string,unknown>;
          target=Object.keys(object).some(k=>k.startsWith('.'))?object[sub?'.'+sub:'.']:sub?undefined:object;
        }
        if(target===undefined)return {file:null,package:null,resource:false,limit:'unresolved-import'};
        if(target && typeof target==='object') {
          const conditions=target as Record<string,unknown>;
          if(Object.keys(conditions).some(k=>!['import','default'].includes(k)))return {file:null,package:null,resource:false,limit:'conditional-resolution'};
          target=Object.values(conditions)[0];
        }
      } else if(sub)target='.'+sub;
      else {
        const module=workspace.manifest['module'], main=workspace.manifest['main'];
        if(module && main && module!==main)return {file:null,package:null,resource:false,limit:'conditional-resolution'};
        target=module??main??'./index';
      }
      if(exports!==undefined&&(typeof target!=='string'||!target.startsWith('./')||target.split('/').includes('..')))return {file:null,package:null,resource:false,limit:'conditional-resolution'};
      return typeof target==='string'?this.local(posix.join(workspace.root,target))??{file:null,package:null,resource:false,limit:'unresolved-import'}:{file:null,package:null,resource:false,limit:'conditional-resolution'};
    }
    return {file:null,package:null,resource:false,limit:'unresolved-import'};
  }
  private loadConfig():RuntimeConfig {
    const config:RuntimeConfig={env:new Map(),dynamic:false,paths:{},baseUrl:null,nodeNext:false,verbatimModuleSyntax:false,configFile:null};
    let tsconfigPath:string|null=null;
    for(const ext of ['js','mjs','ts']) {
      const path=posix.join(this.app.root,`next.config.${ext}`), file=this.snapshot.files.get(path);if(!this.snapshot.inventory.has(path))continue;this.metadataPaths.add(path);if(!file){config.dynamic=true;break;}
      config.configFile=path;
      const {ast,failed}=parseSource(path,file.text);
      if(failed){config.dynamic=true;break;}
      const constants=new Map<string,ts.Expression>();
      let expression:ts.Expression|undefined;
      for(const s of ast.statements) {
        if(ts.isVariableStatement(s) && (s.declarationList.flags & ts.NodeFlags.Const))for(const d of s.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.initializer)constants.set(d.name.text,d.initializer);
        if(ts.isExportAssignment(s))expression=s.expression;
        if(ext==='js' && ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && s.expression.left.getText(ast)==='module.exports')expression=s.expression.right;
      }
      let object=expression;
      if(object && ts.isIdentifier(object))object=constants.get(object.text);
      if(object && (ts.isAsExpression(object)||ts.isSatisfiesExpression(object)))object=object.expression;
      if(!object || !ts.isObjectLiteralExpression(object)) {config.dynamic=true;break;}
      for(const p of object.properties) {
        if(!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name)){config.dynamic=true;continue;}
        const name=p.name.getText(ast).replace(/^['"]|['"]$/g,''),value=literal(p.initializer,constants);
        if(name==='env') {
          let env=p.initializer;if(ts.isIdentifier(env))env=constants.get(env.text)??env;
          if(!ts.isObjectLiteralExpression(env)){config.dynamic=true;continue;}
          for(const entry of env.properties) {
            if(ts.isPropertyAssignment(entry)&&!ts.isComputedPropertyName(entry.name)){const key=entry.name.getText(ast).replace(/^['"]|['"]$/g,'');if(key!=='__proto__')config.env.set(key,entry.initializer);}
            else config.dynamic=true;
          }
        } else if(name==='typescript' && value && typeof value==='object') { const custom=(value as Record<string,unknown>)['tsconfigPath'];if(typeof custom==='string')tsconfigPath=posix.join(this.app.root,custom); }
        else if(name==='pageExtensions' && (!Array.isArray(value)||value.some(v=>!['js','jsx','ts','tsx'].includes(String(v)))))config.dynamic=true;
        else if(name==='turbopack' && (!value || typeof value!=='object' || Object.keys(value).length))config.dynamic=true;
        else if(name==='webpack')config.dynamic=true;
        else if(name==='experimental' && value && typeof value==='object' && (value as Record<string,unknown>)['extensionAlias'])config.dynamic=true;
        else if(name==='transpilePackages' && (!Array.isArray(value)||value.some(v=>typeof v!=='string'||!this.workspaceMap.has(v))))config.dynamic=true;
      }
      const dependencies=new Set<string>();
      const dependenciesOf=(n:ts.Node):void=>{
        if(ts.isIdentifier(n)&&constants.has(n.text)&&!dependencies.has(n.text)) {dependencies.add(n.text);dependenciesOf(constants.get(n.text)!);}
        ts.forEachChild(n,dependenciesOf);
      };
      if(expression)dependenciesOf(expression);
      let modified=false;
      const mentions=(n:ts.Node):boolean=>{let found=false;const visit=(x:ts.Node):void=>{if(ts.isIdentifier(x)&&dependencies.has(x.text))found=true;ts.forEachChild(x,visit);};visit(n);return found;};
      const mutation=(n:ts.Node):void=>{
        if(ts.isFunctionLike(n))return;
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&mentions(n.left))modified=true;
        if(ts.isDeleteExpression(n)&&mentions(n.expression))modified=true;
        if(ts.isCallExpression(n)&&n.arguments.some(mentions))modified=true;
        ts.forEachChild(n,mutation);
      };
      for(const statement of ast.statements)mutation(statement);
      if(modified){config.dynamic=true;config.env.clear();}
      break;
    }
    const selected=tsconfigPath??['tsconfig.json','jsconfig.json'].map(n=>posix.join(this.app.root,n)).find(p=>this.snapshot.inventory.has(p));
    const seen=new Set<string>();
    const load=(path:string):void=>{
      if(seen.has(path)){config.dynamic=true;return;}seen.add(path);
      this.metadataPaths.add(path);
      const text=this.snapshot.files.get(path)?.text;if(text===undefined){if(this.snapshot.inventory.has(path)&&!this.snapshot.failures.has(path))this.readRequests.add(path);config.dynamic=true;return;}
      const parsed=ts.parseConfigFileTextToJson(path,text);if(parsed.error){config.dynamic=true;return;}
      const data=parsed.config as Record<string,unknown>;
      if(data['extends']) {
        if(typeof data['extends']!=='string'||!data['extends'].startsWith('.'))config.dynamic=true;
        else {let parent=posix.join(posix.dirname(path),data['extends']);if(!parent.endsWith('.json'))parent+='.json';load(parent);}
      }
      const options=data['compilerOptions'] as Record<string,unknown>|undefined;
      if(!options)return;
      if(typeof options['baseUrl']==='string')config.baseUrl=posix.join(posix.dirname(path),options['baseUrl']);
      if(typeof options['moduleResolution']==='string')config.nodeNext=options['moduleResolution'].toLowerCase()==='nodenext';
      if(options['verbatimModuleSyntax']!==undefined){if(typeof options['verbatimModuleSyntax']==='boolean')config.verbatimModuleSyntax=options['verbatimModuleSyntax'];else config.dynamic=true;}
      if(options['importsNotUsedAsValues']!==undefined||options['preserveValueImports']!==undefined)config.dynamic=true;
      if(options['paths'] && typeof options['paths']==='object') {
        for(const [key,value] of Object.entries(options['paths'])) {
          if(!Array.isArray(value)||value.some(v=>typeof v!=='string')||key.split('*').length>2){config.dynamic=true;continue;}
          config.paths[key]=value.map(v=>posix.join(config.baseUrl??posix.dirname(path),String(v)));
        }
      }
    };
    if(selected)load(selected);
    return config;
  }
}
