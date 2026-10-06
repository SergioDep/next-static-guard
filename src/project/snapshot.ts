import { checkBudget } from './budget.js';
import { GuardError } from '../cli/errors.js';
import { lstat, readdir, readFile, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, relative, resolve, sep, posix, isAbsolute } from 'node:path';
import picomatch from 'picomatch';
import semver from 'semver';
import ts from 'typescript';
import { discover } from './discover.js';
import { Resolver } from './resolve.js';
import { retainsBinding } from '../graph/build.js';
import { sha256 } from '../report/fingerprint.js';
import { RULE_IDS } from '../types.js';
import type { Limit, Policy, ProjectSnapshot, ProjectVersions, SnapshotFile } from '../types.js';
export const INTERNAL_EXCLUSIONS = ['.git', '.next', 'node_modules', 'dist', 'build', 'coverage'];
export function inside(root: string, file: string): boolean { const r = relative(root, file); return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r)); }
export function relativePath(root: string, file: string): string { return relative(root, file).split(sep).join('/') || '.'; }
export function excluded(file: string, policy: Policy): boolean { return file.split('/').some(s => INTERNAL_EXCLUSIONS.includes(s) || s.startsWith('.env') || ['.aws', '.codex', '.agents', '.ssh'].includes(s)) || policy.exclude.some(g => picomatch(g, {dot: true, nocase: false})(file)); }
export function parseJSON(text: string | undefined): Record<string, unknown> | null { try { const v: unknown = JSON.parse(text ?? ''); return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { return null; } }
export function manifestVersions(files: ReadonlyMap<string, SnapshotFile>, root: string): ProjectVersions {
  const manifest = parseJSON(files.get(posix.join(root, 'package.json'))?.text);
  const lookup = (pkg: string): string | null => {
    const deps = {...(manifest?.['devDependencies'] as object ?? {}), ...(manifest?.['dependencies'] as object ?? {})} as Record<string, unknown>;
    let dir = root;
    while (true) {
      const lockFile=files.get(posix.join(dir,'package-lock.json'));
      const lock = parseJSON(lockFile?.text);
      if(lockFile && !lock)return null;
      if (lock) {
        if (lock['lockfileVersion'] !== 3) return null;
        const packages = lock['packages'] as Record<string, Record<string, unknown>> | undefined;
        let lookupDir = root;
        while (true) {
          const path = posix.relative(dir, posix.join(lookupDir, 'node_modules', pkg));
          const v = packages?.[path]?.['version'];
          if (typeof v === 'string') return semver.valid(v) === v ? v : null;
          if (lookupDir === dir || lookupDir === '.') break;
          lookupDir = posix.dirname(lookupDir);
        }
        break;
      }
      if (dir === '.') break;
      dir = posix.dirname(dir);
    }
    const v = deps[pkg]; return typeof v === 'string' && semver.valid(v) === v ? v : null;
  };
  return {root, nextVersion: lookup('next'), reactVersion: lookup('react'), reactDomVersion: lookup('react-dom'), typescriptVersion: lookup('typescript')};
}
export async function filesystemSnapshot(scanRoot: string, policy: Policy, output: string | null = null): Promise<ProjectSnapshot> {
  const root = await realpath(scanRoot);
  if (!(await lstat(root)).isDirectory()) throw new GuardError('Scan root must be a directory.');
  for(const projectRoot of policy.projectRoots) {
    const configured=await realpath(resolve(root,projectRoot)).catch(()=>null);
    if(configured&&!inside(root,configured))throw new GuardError('Configured project root escapes the scan root.');
  }
  const files = new Map<string, SnapshotFile>(), inventory = new Set<string>(), aliases = new Map<string, string>(), limits: Limit[] = [];
  const walked = new Set<string>(),failures = new Map<string, Limit['code']>();
  const read = async (file: string, display: string, metadataHint=false): Promise<void> => {
    inventory.add(display);
    if(files.has(display)||failures.has(display))return;
    const metadata = metadataHint || /(?:^|\/)(?:package(?:-lock)?\.json|(?:ts|js)config[^/]*\.json|next\.config\.(?:js|mjs|ts)|next-static-guard\.json)$/.test(display);
    if (!metadata && !/\.(?:[cm]?[jt]sx?|json)$/.test(display)) return;
    try {
      const before = await lstat(file);
      if (before.size > (metadata ? 10 : 2) * 1024 * 1024) { failures.set(display,'source-budget'); return; }
      const actual=await realpath(file);if(!inside(root,actual)||actual!==file)throw new GuardError('Source changed during snapshot reading.');
      const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      let buffer:Buffer;try {const opened=await handle.stat();if(opened.ino!==before.ino||opened.size!==before.size)throw new GuardError('Source changed during snapshot reading.');buffer=await handle.readFile();}finally{await handle.close();}
      const after=await lstat(file);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new GuardError('Source changed during snapshot reading.');
      let text: string;
      try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM:true}).decode(buffer); } catch { failures.set(display,'unsupported-syntax'); return; }
      // Saved reports are not program sources, even with a .json suffix.
      if (!metadata && display.endsWith('.json') && parseJSON(text)?.['fingerprintVersion'] === 1 && parseJSON(text)?.['toolVersion']) return;
      files.set(display, {path:display, text, hash:sha256(buffer), bytes:buffer.length});
      if(/(?:^|\/)package(?:-lock)?\.json$/.test(display)&&!parseJSON(text))failures.set(display,'unsupported-syntax');
    } catch (error) {
      if (error instanceof Error && error.message === 'Source changed during snapshot reading.') throw error;
      failures.set(display,'source-excluded');
    }
  };
  const walk = async (absolute: string, logical: string): Promise<void> => {
    checkBudget();
    if (logical !== '.' && excluded(logical, policy)) return;
    if (output && resolve(absolute) === resolve(output)) return;
    let actual: string;
    try { actual = await realpath(absolute); } catch { inventory.add(logical); return; }
    if (!inside(root, actual)) { inventory.add(logical);failures.set(logical,'source-excluded'); return; }
    const canonicalPath = relativePath(root, actual);
    if (canonicalPath !== logical) aliases.set(logical, canonicalPath);
    const stat = await lstat(actual);
    if (stat.isDirectory()) {
      if (walked.has(actual)) return;
      walked.add(actual);
      let children:string[];try{children=await readdir(actual);}catch{inventory.add(canonicalPath);failures.set(canonicalPath,'source-excluded');return;}
      for (const child of children.sort()) await walk(resolve(actual, child), posix.join(canonicalPath, child));
    } else if (stat.isFile()) {inventory.add(canonicalPath);if(/(?:^|\/)(?:package(?:-lock)?\.json|(?:ts|js)config[^/]*\.json|next\.config\.(?:js|mjs|ts)|next-static-guard\.json)$/.test(canonicalPath))await read(actual,canonicalPath);}
  };
  await walk(root, '.');
  const versions = new Map<string, ProjectVersions>();
  const snapshot:ProjectSnapshot={root,files,inventory,aliases,limits,failures,versions,kind:'current'};
  const metadataCache=new Map<string,{version:string|null;failure:Limit['code']|null}>();
  for (const app of discover(snapshot,policy).apps) {
    const appRoot=app.root,base=manifestVersions(files,appRoot);
    for (const [pkg, key] of [['next','nextVersion'],['react','reactVersion'],['react-dom','reactDomVersion'],['typescript','typescriptVersion']] as const) {
      let dir = resolve(root, appRoot);
      while (inside(root, dir)) {
        const metadata=resolve(dir,'node_modules',pkg,'package.json');
        try {
          const installed=await realpath(metadata);if(!inside(root,installed))break;
          let result=metadataCache.get(installed);
          if(!result) {
            const display=relativePath(root,installed);
            await read(installed,display,true);
            const data=parseJSON(files.get(display)?.text),version=data?.['version'];
            result={version:typeof version==='string'&&semver.valid(version)===version?version:null,failure:failures.get(display)??(data?null:'unsupported-syntax')};
            metadataCache.set(installed,result);
          }
          if(result.failure&&pkg!=='typescript')limits.push({code:result.failure,location:{file:relativePath(root,installed),start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0}},affectedRules:[...RULE_IDS],snapshot:'current',projectRoot:appRoot});
          base[key]=result.version&&(!base[key]||base[key]===result.version)?result.version:null;
          break;
        } catch(error) {
          if(error instanceof GuardError)throw error;
          const code=(error as NodeJS.ErrnoException).code;
          if(code!=='ENOENT'&&code!=='ENOTDIR') {
            base[key]=null;
            if(pkg!=='typescript')limits.push({code:'source-excluded',location:{file:relativePath(root,metadata),start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0}},affectedRules:[...RULE_IDS],snapshot:'current',projectRoot:appRoot});
            break;
          }
        }
        if (dir === root) break;
        dir = dirname(dir);
      }
    }
    versions.set(appRoot, base);
  }
  await materializeSources(snapshot,policy,(path,metadata)=>read(resolve(root,path),path,metadata));
  return snapshot;
}

/** Materialize runtime-reachable files before passing an immutable view to the engine. */
export async function materializeSources(snapshot:ProjectSnapshot,policy:Policy,read:(path:string,metadata?:boolean)=>Promise<void>):Promise<void> {
 const {apps}=discover(snapshot,policy),seen=new Set<string>();
 let bytes=0;
 for(const app of apps) {
  if(app.versions.nextVersion!=='16.3.8'||app.versions.reactVersion!=='19.3.0'||app.versions.reactDomVersion!=='19.3.0')continue;
  let resolver=new Resolver(snapshot,app,policy);
  for(let hop=0;hop<64&&resolver.readRequests.size;hop++) {
   for(const request of resolver.readRequests)await read(request,true);
   resolver=new Resolver(snapshot,app,policy);
  }
  const queue=app.entries.map(e=>e.file),appSeen=new Set<string>();
  while(queue.length) {
   checkBudget();
   const path=queue.shift()!;if(appSeen.has(path))continue;appSeen.add(path);
   if(!seen.has(path)) {
    if(seen.size>=50_000||bytes>=512*1024*1024){(snapshot.failures as Map<string,Limit['code']>).set(path,'source-budget');continue;}
    await read(path);
    const size=snapshot.files.get(path)?.bytes??0;
    if(bytes+size>512*1024*1024){(snapshot.files as Map<string,SnapshotFile>).delete(path);(snapshot.failures as Map<string,Limit['code']>).set(path,'source-budget');continue;}
    seen.add(path);bytes+=size;
   }
   const source=resolver.source(path);if(!source||source.invalidDirective)continue;
   const edge=source.ast.statements.some(s=>ts.isVariableStatement(s)&&s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&s.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='runtime'&&d.initializer&&ts.isStringLiteral(d.initializer)&&d.initializer.text==='edge'));
   if(edge&&app.entries.some(e=>e.file===path))continue;
   const follow=(specifier:string):void=>{const destination=resolver.resolve(path,specifier).file;if(destination)queue.push(destination);};
   for(const statement of source.ast.statements) {
    if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)) {
     const clause=statement.importClause;if(clause?.isTypeOnly)continue;
     const names:string[]=[];
     if(clause?.name)names.push(clause.name.text);
     if(clause?.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))names.push(clause.namedBindings.name.text);else for(const e of clause.namedBindings.elements)if(!e.isTypeOnly)names.push(e.name.text);}
     if(!clause||names.some(name=>retainsBinding(source.ast,name,resolver.config.verbatimModuleSyntax))||clause.namedBindings&&ts.isNamedImports(clause.namedBindings)&&!clause.namedBindings.elements.length&&(!/\.tsx?$/.test(path)||resolver.config.verbatimModuleSyntax))follow(statement.moduleSpecifier.text);
    } else if(ts.isExportDeclaration(statement)&&!statement.isTypeOnly&&statement.moduleSpecifier&&ts.isStringLiteral(statement.moduleSpecifier))follow(statement.moduleSpecifier.text);
   }
   const dynamic=(node:ts.Node):void=>{if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0]))follow(node.arguments[0].text);ts.forEachChild(node,dynamic);};dynamic(source.ast);
  }
 }
}
