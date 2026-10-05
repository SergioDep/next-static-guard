import { posix } from 'node:path';
import picomatch from 'picomatch';
import ts from 'typescript';
import type { Policy, ProjectSnapshot, ProjectVersions, Unsupported } from '../types.js';
import { manifestVersions, parseJSON } from './snapshot.js';
import { parseSource } from './parse.js';
export interface App { root: string; appDir: string; entries: {file:string; handler:boolean; clientRequired:boolean}[]; versions: ProjectVersions }
export function workspaces(snapshot: ProjectSnapshot): Map<string, {root:string; manifest:Record<string,unknown>}> {
  const manifest = parseJSON(snapshot.files.get('package.json')?.text), value = manifest?.['workspaces'];
  const globs = Array.isArray(value) ? value : (value as {packages?:unknown} | undefined)?.packages;
  const result = new Map<string,{root:string;manifest:Record<string,unknown>}>();
  if (!Array.isArray(globs)) return result;
  for (const path of snapshot.files.keys()) if (path.endsWith('/package.json')) {
    const root = posix.dirname(path);
    if (!globs.some(g => typeof g === 'string' && picomatch(g, {dot:true})(root))) continue;
    const data = parseJSON(snapshot.files.get(path)?.text);
    if (typeof data?.['name'] === 'string') {
      const name = data['name'];
      if (result.has(name)) result.set(name, {root:'',manifest:{}});
      else result.set(name,{root,manifest:data});
    }
  }
  return result;
}
export function discover(snapshot: ProjectSnapshot, policy: Policy): {apps:App[]; unsupported:Unsupported[]} {
  const roots = new Set([...policy.projectRoots.map(r=>snapshot.aliases.get(r)??r), ...[...workspaces(snapshot).values()].map(w => w.root).filter(Boolean)]);
  const apps: App[] = [], unsupported: Unsupported[] = [];
  for (const root of [...roots].sort()) {
    const paths = [...snapshot.inventory].filter(f => root === '.' || f.startsWith(`${root}/`));
    const standard = posix.join(root,'app'), src = posix.join(root,'src/app');
    const appDir = paths.some(p => p.startsWith(`${standard}/`)) ? standard : src;
    const entries: App['entries'] = [];
    let hasAppEntry=false;
    for (const file of paths) {
      if (/(?:^|\/)pages\//.test(file)) unsupported.push({file,feature:'pages-router'});
      if (/\.(?:cjs|cts|mts)$/.test(file)) unsupported.push({file,feature:'commonjs'});
      if (/\.mdx$/.test(file)) unsupported.push({file,feature:'mdx'});
      if (/(?:^|\/)(?:src\/)?(?:proxy|instrumentation)\.[jt]s$/.test(file)) unsupported.push({file,feature:file.includes('instrumentation')?'instrumentation':'proxy'});
      if (!file.startsWith(`${appDir}/`)) continue;
      if (/(?:^|\/)(?:opengraph-image|twitter-image|sitemap|robots|manifest|icon|apple-icon)\./.test(file)) { unsupported.push({file,feature:'metadata'}); continue; }
      if (!/(?:^|\/)(?:page|layout|template|default|loading|not-found|forbidden|unauthorized|error|global-error|route)\.(?:js|jsx|ts|tsx)$/.test(file)) continue;
      hasAppEntry=true;
      const text = snapshot.files.get(file)?.text;
      if (text) {
        const {ast} = parseSource(file,text);
        const metadataNames=new Set(['generateMetadata','generateViewport','generateStaticParams','generateImageMetadata']);
        for(const statement of ast.statements) {
          if(!ts.canHaveModifiers(statement)||!ts.getModifiers(statement)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
          if(ts.isFunctionDeclaration(statement)&&statement.name&&metadataNames.has(statement.name.text))unsupported.push({file,feature:'metadata'});
          if(ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&metadataNames.has(d.name.text)))unsupported.push({file,feature:'metadata'});
        }
        let edge = false;
        for (const statement of ast.statements) if (ts.isVariableStatement(statement) && statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === 'runtime' && d.initializer && ts.isStringLiteral(d.initializer) && d.initializer.text === 'edge') edge = true;
        }
        if (edge) {unsupported.push({file,feature:'edge'});continue;}
      }
      entries.push({file,handler:/\/route\./.test(file),clientRequired:/\/(?:global-)?error\./.test(file)});
    }
    if (hasAppEntry) apps.push({root,appDir,entries,versions:snapshot.versions.get(root) ?? manifestVersions(snapshot.files,root)});
  }
  return {apps, unsupported:[...new Map(unsupported.map(v => [`${v.file}:${v.feature}`,v])).values()].sort((a,b) => a.file.localeCompare(b.file,'en'))};
}
