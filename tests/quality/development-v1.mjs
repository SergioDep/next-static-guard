// Expectations are authored from the framework contracts, before Guard is run.
// This is a synthetic reserved sample, not evidence from production repositories.
export const token = 'FICTIONAL_RESERVED_QUALITY_TOKEN';
export const versions={node:'24.21.0',next:'16.3.8',react:'19.3.0',reactDom:'19.3.0',typescript:'6.0.3'};
export function originalSources(c) {
 const config={compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',verbatimModuleSyntax:!!c.verbatim,paths:{'@/*':['./*']}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']};
 return {'package.json':JSON.stringify({name:'reserved-quality',private:true,type:'module',dependencies:{next:versions.next,react:versions.react,'react-dom':versions.reactDom,typescript:versions.typescript}}),'tsconfig.json':JSON.stringify(config),'app/layout.tsx':'export default function Layout({children}:any){return <html><body>{children}</body></html>;}',...c.files,...c.configEnv?{'next.config.mjs':`export default ${JSON.stringify({env:c.configEnv})};`}:{},...c.sensitive?{'next-static-guard.json':JSON.stringify({schemaVersion:1,sensitive:c.sensitive})}:{}};
}
export const sources = {
  NSG001: 'https://nextjs.org/docs/app/api-reference/directives/use-client',
  NSG002: 'https://react.dev/reference/rsc/server-components',
  NSG003: 'https://nextjs.org/docs/app/api-reference/directives/use-client',
  NSG004: 'https://react.dev/reference/rsc/use-client#serializable-types-returned-by-server-components',
  NSG005: 'https://nextjs.org/docs/app/guides/data-security',
  NSG006: 'https://nextjs.org/docs/app/guides/environment-variables',
};
export const cases = [];
const client = "'use client';export default function Client(props:any){return <p>Allowed</p>;}", secret = {env:[{name:'TOKEN',category:'secret'}],exports:[]};
function add(rule, description, files, oracle, options={}) {
  const number=cases.filter(c=>c.rule===rule&&c.expected===(options.clean?'clean':'finding')).length+1;
  cases.push({id:`${rule}-${options.clean?'N':'P'}${String(number).padStart(2,'0')}`,rule,description,expected:options.clean?'clean':'finding',oracle,reference:sources[rule],files, ...options});
}
const page = (pre,body="<p>Allowed</p>",directive='') => `${directive}${pre}export default function Page(){return ${body};}`;
const props = (pre,expression) => ({'app/page.tsx':page(`import Client from './client';${pre}`,`<Client data={${expression}}/>`),'app/client.tsx':client});

// Dependencies: distinct entry points, import forms, retention, and graph paths.
for(const [description,files,pattern] of [
 ['direct server-only dependency',{'app/page.tsx':page("import '../lib/dal';",'<p/>',"'use client';"),'lib/dal.ts':"import 'server-only';export const label='Allowed';"},'server-only'],
 ['server-only barrel dependency',{'app/page.tsx':page("import {label} from '../lib/barrel';",'<p>{label}</p>',"'use client';"),'lib/barrel.ts':"export {label} from './dal';",'lib/dal.ts':"import 'server-only';export const label='Allowed';"},'server-only'],
 ['server-only star beside consumed value',{'app/page.tsx':page("import {label} from '../lib/barrel';",'<p>{label}</p>',"'use client';"),'lib/barrel.ts':"export * from './dal';export const label='Allowed';",'lib/dal.ts':"import 'server-only';export const hidden=1;"},'server-only'],
 ['aliased server-only dependency',{'app/page.tsx':page("import {label} from '@/lib/dal';",'<p>{label}</p>',"'use client';"),'lib/dal.ts':"import 'server-only';export const label='Allowed';"},'server-only'],
 ...['fs','node:fs','fs/promises','node:fs/promises'].map(module=>[`${module} consumed named import`,{'app/page.tsx':page(`import {readFile as read} from '${module}';`,'<button onClick={()=>read("fictional.txt",()=>{})}>Read</button>',"'use client';")},module.replace(':','\\:')]),
 ['filesystem default import',{'app/page.tsx':page("import fs from 'fs';",'<button onClick={()=>fs.existsSync("fictional.txt")}>Read</button>',"'use client';")},'fs'],
 ['filesystem consumed namespace',{'app/page.tsx':page("import * as filesystem from 'node:fs';",'<button onClick={()=>filesystem.existsSync("fictional.txt")}>Read</button>',"'use client';")},'node:fs'],
 ['filesystem retained unused namespace',{'app/page.tsx':page("import * as filesystem from 'node:fs/promises';",'<p/>',"'use client';")},'node:fs'],
 ['filesystem retained named barrel',{'app/page.tsx':page("import {label} from '../lib/barrel';",'<p>{label}</p>',"'use client';"),'lib/barrel.ts':"export {readFile} from 'fs';export const label='Allowed';"},'fs'],
 ['filesystem retained star barrel',{'app/page.tsx':page("import {label} from '../lib/barrel';",'<p>{label}</p>',"'use client';"),'lib/barrel.ts':"export * from 'node:fs';export const label='Allowed';"},'node:fs'],
 ['filesystem promise namespace barrel',{'app/page.tsx':page("import {label} from '../lib/barrel';",'<p>{label}</p>',"'use client';"),'lib/barrel.ts':"export * as filesystem from 'node:fs/promises';export const label='Allowed';"},'node:fs'],
 ['headers import',{'app/page.tsx':page("import {headers} from 'next/headers';",'<button onClick={()=>headers()}>Read</button>',"'use client';")},'next/headers'],
 ['cookies import alias',{'app/page.tsx':page("import {cookies as jar} from 'next/headers';",'<button onClick={()=>jar()}>Read</button>',"'use client';")},'next/headers'],
 ['cache invalidation in event',{'app/page.tsx':page("import {revalidatePath} from 'next/cache';",'<button onClick={()=>revalidatePath("/")}>Refresh</button>',"'use client';")},'next/cache'],
 ['headers local helper',{'app/page.tsx':page("import {read} from '../lib/request';",'<button onClick={()=>read()}>Read</button>',"'use client';"),'lib/request.ts':"import {headers} from 'next/headers';export function read(){return headers();}"},'next/headers'],
 ['cookies named reexport',{'app/page.tsx':page("import {jar} from '../lib/request';",'<button onClick={()=>jar()}>Read</button>',"'use client';"),'lib/request.ts':"export {cookies as jar} from 'next/headers';"},'next/headers'],
 ['server-only transitive client component',{'app/page.tsx':page("import Widget from './widget';",'<Widget/>'),'app/widget.tsx':page("import '../lib/dal';",'<p/>',"'use client';"),'lib/dal.ts':"import 'server-only';"},'server-only'],
]) add('NSG001',description,files,description==='cookies named reexport'?{kind:'client-event-error',pattern:'cookies.*outside a request scope'}:{kind:'rejected-build',pattern},description.includes('retained unused')?{verbatim:true}:{});

for(const hook of ['useState','useEffect','useReducer']) for(const form of ['named','alias','namespace','helper']) {
 const call=hook==='useState'?'(1)':hook==='useEffect'?'(()=>{})':'((state:number)=>state,1)';
 const imports=form==='namespace'?`import * as React from 'react';`:form==='alias'?`import {${hook} as hook} from 'react';`:form==='helper'?"import {read} from '../lib/hook';":`import {${hook}} from 'react';`;
 const expression=form==='helper'?'read()':(form==='namespace'?`React.${hook}`:form==='alias'?'hook':hook)+call;
 add('NSG002',`${hook} ${form} in server render`,{'app/page.tsx':`${imports}export default function Page(){${expression};return <p/>;}`,...(form==='helper'?{'lib/hook.ts':`import {${hook}} from 'react';export function read(){return ${hook}${call};}`}:{})},{kind:'rejected-build',pattern:hook});
}
for(const hook of ['useState','useEffect','useReducer'])add('NSG002',`${hook} retained unused import`,{'app/page.tsx':page(`import {${hook}} from 'react';`)},{kind:'rejected-build',pattern:hook},{verbatim:true});
for(const [description,files,pattern] of [
 ['client-only direct marker',{'app/page.tsx':page("import '../lib/browser';"),'lib/browser.ts':"import 'client-only';"},'client-only'],
 ['client-only transitive barrel',{'app/page.tsx':page("import {label} from '../lib/barrel';",'<p>{label}</p>'),'lib/barrel.ts':"export {label} from './browser';",'lib/browser.ts':"import 'client-only';export const label='Allowed';"},'client-only'],
 ['useRouter server render',{'app/page.tsx':"import {useRouter} from 'next/navigation';export default function Page(){useRouter();return <p/>;}"},'useRouter'],
 ['useRouter helper alias',{'app/page.tsx':"import {read} from '../lib/navigation';export default function Page(){read();return <p/>;}",'lib/navigation.ts':"import {useRouter as navigate} from 'next/navigation';export function read(){return navigate();}"},'useRouter'],
 ['useRouter consumed reexport',{'app/page.tsx':"import {navigate} from '../lib/navigation';export default function Page(){navigate();return <p/>;}",'lib/navigation.ts':"export {useRouter as navigate} from 'next/navigation';"},'useRouter'],
])add('NSG002',description,files,{kind:'rejected-build',pattern});

for(const global of ['window','document','localStorage'])for(const mode of ['module','render','helper','lazy-state','memo','effect-argument']) {
 const expression=global==='window'?'window.innerWidth':global==='document'?'document.title':'localStorage.getItem("fictional")';
 const before=mode==='module'?`const value=${expression};`:mode==='helper'?`function read(){return ${expression};}`:'';
 const imports=['lazy-state','effect-argument'].includes(mode)?"import {useState,useEffect} from 'react';":mode==='memo'?"import {useMemo} from 'react';":'';
 const body=mode==='module'?'const result=value;':mode==='helper'?'const result=read();':mode==='lazy-state'?`const [result]=useState(()=>${expression});`:mode==='memo'?`const result=useMemo(()=>${expression},[]);`:mode==='effect-argument'?`const result=${expression};useEffect(()=>{},[${expression}]);`:`const result=${expression};`;
 add('NSG003',`${global} ${mode} during SSR`,{'app/page.tsx':`'use client';${imports}${before}export default function Page(){${body}return <p>{result}</p>;}`},{kind:'rejected-build',pattern:`${global} is not defined`});
}
add('NSG003','window render destructuring',{'app/page.tsx':"'use client';export default function Page(){const {innerWidth}=window;return <p>{innerWidth}</p>;}"},{kind:'rejected-build',pattern:'window is not defined'});
add('NSG003','document in evaluated event factory',{'app/page.tsx':"'use client';function make(){const title=document.title;return ()=>title;}export default function Page(){return <button onClick={make()}>Read</button>;}"},{kind:'rejected-build',pattern:'document is not defined'});

for(const [type,pre,expression] of [
 ['arrow function','', '()=>1'],['named function','function handler(){return 1;}','handler'],['custom class','class RecordValue {value=1;}','new RecordValue()'],['null prototype','', 'Object.create(null)'],['local symbol','', 'Symbol("local")'],
])for(const [container,wrap] of [['direct',x=>x],['nested object',x=>`{payload:{value:${x}}}`],['array',x=>`[${x}]`],['map',x=>`new Map([["value",${x}]])`]]) {
 add('NSG004',`${type} in ${container}`,props(pre,wrap(expression)),{kind:'rejected-build',pattern:type==='local symbol'?'Symbol|symbol':type==='custom class'||type==='null prototype'?'plain objects|classes|class instances|Only plain':'[Ff]unction|Event handlers'});
}

for(const [description,pre,expression] of [
 ['direct secret','','process.env.TOKEN'],['aliased secret','const value=process.env.TOKEN;','value'],['nested secret object','','{account:{token:process.env.TOKEN}}'],['array secret','','[process.env.TOKEN]'],['map secret','','new Map([["token",process.env.TOKEN]])'],['set secret','','new Set([process.env.TOKEN])'],['spread secret','const value={token:process.env.TOKEN};','{...value}'],['destructured secret','const value={token:process.env.TOKEN};const {token}=value;','token'],['one helper secret','function read(){return process.env.TOKEN;}','read()'],['two helper secret','function read(){return process.env.TOKEN;}function wrap(){return read();}','wrap()'],['converted secret','','String(process.env.TOKEN)'],['combined secret','','"prefix:"+process.env.TOKEN'],['promise secret','','Promise.resolve(process.env.TOKEN)'],['fragment secret','','<><span>{process.env.TOKEN}</span></>'],['intrinsic attribute secret','','<span data-token={process.env.TOKEN}/>'],
])add('NSG005',description,props(pre,expression),{kind:'payload-present'},{sensitive:secret});
add('NSG005','private named export field',{'app/page.tsx':page("import Client from './client';import {profile} from '../lib/profile';",'<Client data={profile.email}/>'),'app/client.tsx':client,'lib/profile.ts':`export const profile={email:'${token}',name:'Allowed'};`},{kind:'payload-present'},{sensitive:{env:[],exports:[{file:'lib/profile.ts',export:'profile',field:['email'],category:'private'}]}});
add('NSG005','default secret export to browser',{'app/page.tsx':page("import value from '../lib/value';",'<p>{value}</p>',"'use client';"),'lib/value.ts':`export default '${token}';`},{kind:'bundle-present'},{sensitive:{env:[],exports:[{file:'lib/value.ts',export:'default',field:[],category:'secret'}]}});
add('NSG005','named export through barrel to browser',{'app/page.tsx':page("import {value} from '../lib/barrel';",'<p>{value}</p>',"'use client';"),'lib/barrel.ts':"export {value} from './value';",'lib/value.ts':`export const value='${token}';`},{kind:'bundle-present'},{sensitive:{env:[],exports:[{file:'lib/value.ts',export:'value',field:[],category:'secret'}]}});
add('NSG005','explicit public environment publication',{'app/page.tsx':page('', '<p>{process.env.TOKEN}</p>',"'use client';")},{kind:'bundle-present'},{sensitive:secret,configEnv:{TOKEN:token}});
add('NSG005','client referenced action return',{'app/page.tsx':page("import {load} from './actions';",'<button onClick={()=>load()}>Load</button>',"'use client';"),'app/actions.ts':"'use server';export async function load(){return {token:process.env.TOKEN};}"},{kind:'action-return'},{sensitive:secret});

for(const notation of ['dot','bracket'])for(const mode of ['render','module','effect','event','helper','default-helper','barrel-helper','nested-client','array','template']) {
 const read=notation==='dot'?'process.env.TOKEN':"process.env['TOKEN']";
 let files;
 if(['helper','default-helper','barrel-helper'].includes(mode)) {
  files={'app/page.tsx':page(mode==='default-helper'?"import read from '../lib/read';":"import {read} from '../lib/read';",'<p>{read()}</p>',"'use client';"),'lib/read.ts':mode==='default-helper'?`export default function read(){return ${read};}`:mode==='barrel-helper'?"export {read} from './source';":`export function read(){return ${read};}`,...(mode==='barrel-helper'?{'lib/source.ts':`export function read(){return ${read};}`}:{})};
 }else if(mode==='nested-client')files={'app/page.tsx':page("import Widget from './widget';",'<Widget/>'),'app/widget.tsx':page('',`<p>{${read}}</p>`,"'use client';")};
 else if(mode==='module')files={'app/page.tsx':page(`const value=${read};`,'<p>{value}</p>',"'use client';")};
 else if(mode==='effect')files={'app/page.tsx':`'use client';import {useEffect} from 'react';export default function Page(){useEffect(()=>{console.log(${read});},[]);return <p/>;}`};
 else if(mode==='event')files={'app/page.tsx':page('',`<button onClick={()=>console.log(${read})}>Read</button>`,"'use client';")};
 else files={'app/page.tsx':page('',mode==='array'?`<p>{[${read}]}</p>`:mode==='template'?'<p>{`Value:'+ '${'+read+'}'+'`}</p>':`<p>{${read}}</p>`,"'use client';")};
 add('NSG006',`private env ${notation} ${mode}`,files,{kind:'bundle-absent-private',pattern:'TOKEN'});
}

// Valid controls contrast dependency, execution, transfer, and publication facts.
for(const [description,files] of [
 ['explicit filesystem type import',{'app/page.tsx':page("import type {Stats} from 'node:fs';",'<p/>',"'use client';")}],
 ['unused filesystem import elided',{'app/page.tsx':page("import {readFile} from 'node:fs';",'<p/>',"'use client';")}],
 ['filesystem exclusively on server',{'app/page.tsx':page("import {existsSync} from 'node:fs';",'<p>{String(existsSync("fictional.txt"))}</p>')}],
 ['client action with server-only dependency',{'app/page.tsx':page("import {load} from './actions';",'<button onClick={()=>load()}>Load</button>',"'use client';"),'app/actions.ts':"'use server';import 'server-only';export async function load(){return 1;}"}],
 ['shared pure barrel',{'app/page.tsx':page("import {value} from '../lib/barrel';",'<p>{value}</p>',"'use client';"),'lib/barrel.ts':"export {value} from './source';",'lib/source.ts':"export const value=1;"}],
 ['filesystem type reexport',{'app/page.tsx':page("import {value} from '../lib/barrel';",'<p>{value}</p>',"'use client';"),'lib/barrel.ts':"export type {Stats} from 'node:fs';export const value=1;"}],
])add('NSG001',description,files,{kind:'accepted-build'},{clean:true});
for(const [description,files] of [
 ['state in client render',{'app/page.tsx':"'use client';import {useState} from 'react';export default function Page(){const [value]=useState(1);return <p>{value}</p>;}"}],
 ['effect in client render',{'app/page.tsx':"'use client';import {useEffect} from 'react';export default function Page(){useEffect(()=>{},[]);return <p/>;}"}],
 ['reducer in transitive client',{'app/page.tsx':page("import Widget from './widget';",'<Widget/>'),'app/widget.tsx':"'use client';import {useReducer} from 'react';export default function Page(){const [value]=useReducer((s:number)=>s,1);return <p>{value}</p>;}"}],
 ['local similarly named hook',{'app/page.tsx':"function useRouter(){return 1;}export default function Page(){return <p>{useRouter()}</p>;}"}],
 ['unused React hook reexport',{'app/page.tsx':page("import {value} from '../lib/barrel';",'<p>{value}</p>'),'lib/barrel.ts':"export {useState} from 'react';export const value=1;"}],
 ['client-only module behind boundary',{'app/page.tsx':page("import Widget from './widget';",'<Widget/>'),'app/widget.tsx':page("import 'client-only';",'<p/>',"'use client';")}],
])add('NSG002',description,files,{kind:'accepted-build'},{clean:true});
for(const [description,source] of [
 ['window in effect',"import {useEffect} from 'react';export default function Page(){useEffect(()=>{console.log(window.innerWidth);},[]);return <p/>;}"],
 ['document in event',"export default function Page(){return <button onClick={()=>console.log(document.title)}>Read</button>;}"],
 ['localStorage in event',"export default function Page(){return <button onClick={()=>localStorage.getItem('fictional')}>Read</button>;}"],
 ['guarded window',"export default function Page(){if(typeof window!=='undefined')return <p>{window.innerWidth}</p>;return <p/>;}"],
 ['shadowed document',"const document={title:'Allowed'};export default function Page(){return <p>{document.title}</p>;}"],
 ['guarded localStorage',"export default function Page(){if(typeof window!=='undefined'){return <p>{localStorage.getItem('fictional')}</p>;}return <p/>;}"],
])add('NSG003',description,{'app/page.tsx':`'use client';${source}`},{kind:'accepted-build'},{clean:true});
for(const [description,pre,expression] of [
 ['Date','','new Date("2026-01-01")'],['Map','','new Map([["value",1]])'],['Set','','new Set([1,2])'],['global symbol','','Symbol.for("allowed")'],['Promise of DTO','','Promise.resolve({value:1})'],['React fragment','','<><span>Allowed</span></>'],
])add('NSG004',description,props(pre,expression),{kind:'accepted-build'},{clean:true});
for(const [description,files,options] of [
 ['secret excluded from DTO',props('const profile={token:process.env.TOKEN,name:"Allowed"};','{name:profile.name}'),{sensitive:secret}],
 ['server component consumes secret without returning it',props('function Panel({value}:any){return <span>Allowed</span>;}','<Panel value={process.env.TOKEN}/>'),{sensitive:secret}],
 ['spread override removes secret',props('const value={token:process.env.TOKEN};','{...value,token:"Allowed"}'),{sensitive:secret}],
 ['public nonconfidential environment',{'app/page.tsx':page('', '<p>{process.env.NEXT_PUBLIC_LABEL}</p>',"'use client';")},{}],
 ['private field excluded from export DTO',{'app/page.tsx':page("import Client from './client';import {profile} from '../lib/profile';",'<Client data={{name:profile.name}}/>'),'app/client.tsx':client,'lib/profile.ts':`export const profile={email:'${token}',name:'Allowed'};`},{sensitive:{env:[],exports:[{file:'lib/profile.ts',export:'profile',field:['email'],category:'private'}]}}],
 ['action returns only DTO',{'app/page.tsx':page("import {load} from './actions';",'<button onClick={()=>load()}>Load</button>',"'use client';"),'app/actions.ts':"'use server';export async function load(){const value={token:process.env.TOKEN,name:'Allowed'};return {name:value.name};}"},{sensitive:secret}],
])add('NSG005',description,files,{kind:'payload-absent'}, {clean:true,...options});
for(const [description,files,options] of [
 ['private read only on server',{'app/page.tsx':page('','<p>{process.env.TOKEN?"Configured":"Unset"}</p>')},{}],
 ['public dot key',{'app/page.tsx':page('','<p>{process.env.NEXT_PUBLIC_LABEL}</p>',"'use client';")},{}],
 ['public bracket key',{'app/page.tsx':page('',"<p>{process.env['NEXT_PUBLIC_LABEL']}</p>","'use client';")},{}],
 ['NODE_ENV compiler key',{'app/page.tsx':page('','<p>{process.env.NODE_ENV}</p>',"'use client';")},{}],
 ['declared public config env',{'app/page.tsx':page('','<p>{process.env.LABEL}</p>',"'use client';")},{configEnv:{LABEL:'Allowed'}}],
 ['pure shared constant',{'app/page.tsx':page("import {value} from '../lib/shared';",'<p>{value}</p>',"'use client';"),'lib/shared.ts':"export const value='Allowed';"},{}],
])add('NSG006',description,files,{kind:'accepted-build'},{clean:true,...options});
