// Reserved v2: authored after v1 moved to development. No Guard output defines truth.
export const token='FICTIONAL_RESERVED_QUALITY_TOKEN';
export const versions={node:'24.21.0',next:'16.3.8',react:'19.3.0',reactDom:'19.3.0',typescript:'6.0.3'};
export function originalSources(c){return {'package.json':JSON.stringify({name:'reserved-quality',private:true,type:'module',dependencies:{next:versions.next,react:versions.react,'react-dom':versions.reactDom,typescript:versions.typescript}}),'tsconfig.json':JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],allowJs:true,skipLibCheck:true,strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',resolveJsonModule:true,jsx:'react-jsx',verbatimModuleSyntax:!!c.verbatim,paths:{'@/*':['./*']}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}),'app/layout.tsx':'export default function Layout({children}:any){return <html><body>{children}</body></html>;}',...c.files,...c.configEnv?{'next.config.mjs':`export default ${JSON.stringify({env:c.configEnv})};`}:{},...c.sensitive?{'next-static-guard.json':JSON.stringify({schemaVersion:1,sensitive:c.sensitive})}:{}};}
const references={NSG001:'https://nextjs.org/docs/app/api-reference/directives/use-client',NSG002:'https://react.dev/reference/rsc/server-components',NSG003:'https://nextjs.org/docs/app/api-reference/directives/use-client',NSG004:'https://react.dev/reference/rsc/use-client#serializable-types-returned-by-server-components',NSG005:'https://nextjs.org/docs/app/guides/data-security',NSG006:'https://nextjs.org/docs/app/guides/environment-variables'};
export const cases=[];
function add(rule,description,files,oracle,options={}){const expected=options.clean?'clean':'finding',n=cases.filter(c=>c.rule===rule&&c.expected===expected).length+1;cases.push({id:`V2-${rule}-${options.clean?'N':'P'}${String(n).padStart(2,'0')}`,rule,description,expected,oracle,reference:references[rule],files,...options});}
const page=(pre,body='<main>Catalog</main>',client=false)=>`${client?"'use client';":''}${pre}export default function Catalog(){return ${body};}`;
const box="'use client';export default function Box(props:any){return <section>Catalog</section>;}",secret={env:[{name:'TOKEN',category:'secret'}],exports:[]};
const props=(pre,value)=>({'app/page.tsx':page(`import Box from './box';${pre}`,`<Box payload={${value}}/>`),'app/box.tsx':box});
const reject=pattern=>({kind:'rejected-build',pattern});

for(const [description,files] of [
 ['marker with type-only export',{'app/page.tsx':page("import '../lib/dal';",undefined,true),'lib/dal.ts':"import 'server-only';export type Row={id:number};"}],
 ['marker through side-effect wrapper',{'app/page.tsx':page("import '../lib/load';",undefined,true),'lib/load.ts':"import './dal';export const loaded=true;",'lib/dal.ts':"import 'server-only';void 0;"}],
 ['marker through default data helper',{'app/page.tsx':page("import load from '../lib/data';",'<main>{load()}</main>',true),'lib/data.ts':"import 'server-only';export default function load(){return 'Catalog';}"}],
 ['marker through namespace data helper',{'app/page.tsx':page("import * as data from '../lib/data';",'<main>{data.label}</main>',true),'lib/data.ts':"import 'server-only';export const label='Catalog';"}],
 ['marker in JS helper',{'app/page.tsx':page("import {label} from '../lib/data.js';",'<main>{label}</main>',true),'lib/data.js':"import 'server-only';export const label='Catalog';"}],
 ['marker in mjs helper',{'app/page.tsx':page("import label from '../lib/data.mjs';",'<main>{label}</main>',true),'lib/data.mjs':"import 'server-only';export default 'Catalog';"}],
 ['marker in nested client entry',{'app/page.tsx':page("import Counter from './ui/counter';",'<Counter/>'),'app/ui/counter.tsx':page("import '../../lib/dal';",undefined,true),'lib/dal.ts':"import 'server-only';export type Row={id:number};"}],
 ['marker through two value barrels',{'app/page.tsx':page("import {label} from '../lib/a';",'<main>{label}</main>',true),'lib/a.ts':"export {label} from './b';",'lib/b.ts':"export {label} from './dal';",'lib/dal.ts':"import 'server-only';export const label='Catalog';"}],
])add('NSG001',description,files,reject('server-only'));
for(const [module,name]of [['fs','existsSync'],['node:fs','statSync'],['fs/promises','stat'],['node:fs/promises','readFile']])add('NSG001',`${module} API in render`,{'app/page.tsx':`${"'use client';"}import {${name} as inspect} from '${module}';export default function Catalog(){inspect('fictional.txt');return <main/>;}`},reject(module));
add('NSG001','filesystem named import in shared event helper',{'app/page.tsx':page("import {inspect} from '../lib/data';",'<button onClick={()=>inspect()}>Inspect</button>',true),'lib/data.ts':"import {existsSync} from 'node:fs';export function inspect(){return existsSync('fictional.txt');}"},reject('node:fs'));
add('NSG001','filesystem default promise import',{'app/page.tsx':page("import disk from 'node:fs/promises';",'<button onClick={()=>disk.stat("fictional.txt")}>Inspect</button>',true)},reject('node:fs'));
add('NSG001','filesystem literal import executed in event',{'app/page.tsx':page('',"<button onClick={()=>import('node:fs/promises')}>Inspect</button>",true)},reject('node:fs'));
add('NSG001','filesystem namespace reexport consumed by client',{'app/page.tsx':page("import {disk} from '../lib/data';",'<button onClick={()=>disk.statSync("fictional.txt")}>Inspect</button>',true),'lib/data.ts':"export * as disk from 'node:fs';"},reject('node:fs'));
for(const [api,module]of [['cookies','next/headers'],['headers','next/headers'],['revalidatePath','next/cache']])add('NSG001',`${api} retained in JS client entry`,{'app/page.jsx':`'use client';import {${api}} from '${module}';export default function Catalog(){return <button onClick={()=>${api}(${api==='revalidatePath'?"'/'":''})}>Inspect</button>;}`},reject(module));
add('NSG001','filesystem star reexport with consumed unrelated function',{'app/page.tsx':page("import {label} from '../lib/data';",'<main>{label()}</main>',true),'lib/data.ts':"export * from 'fs/promises';export function label(){return 'Catalog';}"},reject('fs/promises'));

for(const [hook,call]of [['useState','(2)'],['useEffect','(()=>{})'],['useReducer','((s:number)=>s,2)']])for(const form of ['named','default','namespace','barrel']){
 const library=form==='namespace'?`import * as Hooks from 'react';export function inspect(){return Hooks.${hook}${call};}`:form==='default'?`import {${hook} as api} from 'react';export default function inspect(){return api${call};}`:`import {${hook} as api} from 'react';export function inspect(){return api${call};}`;
 add('NSG002',`${hook} through ${form} helper`,{'app/page.tsx':`${form==='default'?"import inspect from '../lib/hook';":form==='barrel'?"import {inspect} from '../lib/ui';":"import {inspect} from '../lib/hook';"}export default function Catalog(){inspect();return <main/>;}`,'lib/hook.ts':library,...form==='barrel'?{'lib/ui.ts':"export {inspect} from './hook';"}:{}},reject(hook));
}
for(const [description,files]of [
 ['client marker with type export',{'app/page.tsx':page("import '../lib/browser';"),'lib/browser.ts':"import 'client-only';export type Size=number;"}],
 ['client marker in JS module',{'app/page.tsx':page("import '../lib/browser.js';"),'lib/browser.js':"import 'client-only';void 0;"}],
 ['client marker value through default helper',{'app/page.tsx':page("import label from '../lib/browser';",'<main>{label}</main>'),'lib/browser.ts':"import 'client-only';export default 'Catalog';"}],
 ['client marker through two barrels',{'app/page.tsx':page("import {label} from '../lib/a';",'<main>{label}</main>'),'lib/a.ts':"export {label} from './b';",'lib/b.ts':"export {label} from './browser';",'lib/browser.ts':"import 'client-only';export const label='Catalog';"}],
])add('NSG002',description,files,reject('client-only'));
for(const [description,files]of [
 ['router namespace in server render',{'app/page.tsx':"import * as Navigation from 'next/navigation';export default function Catalog(){Navigation.useRouter();return <main/>;}"}],
 ['router through default helper',{'app/page.tsx':page("import inspect from '../lib/nav';",'<main>{String(inspect())}</main>'),'lib/nav.ts':"import {useRouter} from 'next/navigation';export default function inspect(){return useRouter();}"}],
 ['router through two named helpers',{'app/page.tsx':page("import {inspect} from '../lib/a';",'<main>{String(inspect())}</main>'),'lib/a.ts':"import {read} from './b';export function inspect(){return read();}",'lib/b.ts':"import {useRouter} from 'next/navigation';export function read(){return useRouter();}"}],
 ['retained reducer JS import',{'app/page.jsx':page("import {useReducer} from 'react';")}],
])add('NSG002',description,files,reject(description.startsWith('retained')?'useReducer':'useRouter'));

for(const [global,read]of [['window','window.location.href'],['document','document.documentElement'],['localStorage','localStorage.length']])for(const mode of ['helper-return','helper-argument','state','memo','element-attribute','shared-effect-and-render']){
 let imports='',pre='',body='';
 if(mode==='helper-return'){pre=`function inspect(){return ${read};}`;body='const result=inspect();';}
 if(mode==='helper-argument'){pre='function inspect(value:any){return value;}';body=`const result=inspect(${read});`;}
 if(mode==='state'){imports="import {useState} from 'react';";body=`const [result]=useState(()=>${read});`;}
 if(mode==='memo'){imports="import {useMemo as remember} from 'react';";body=`const result=remember(()=>${read},[]);`;}
 if(mode==='element-attribute'){body=`const result=${read};`;}
 if(mode==='shared-effect-and-render'){imports="import {useEffect} from 'react';";pre=`function inspect(){return ${read};}`;body='const result=inspect();useEffect(()=>{inspect();},[]);';}
 add('NSG003',`${global} ${mode}`,{'app/page.tsx':`'use client';${imports}${pre}export default function Catalog(){${body}return <main data-value={String(result)}>Catalog</main>;}`},reject(`${global} is not defined`));
}
add('NSG003','factory invoked before click callback registration',{'app/page.tsx':"'use client';function create(){const width=window.innerWidth;return ()=>width;}export default function Catalog(){return <button onClick={create()}>Measure</button>;}"},reject('window is not defined'));
add('NSG003','factory invoked before effect callback registration',{'app/page.tsx':"'use client';import {useEffect} from 'react';function create(){const length=localStorage.length;return ()=>{console.log(length);};}export default function Catalog(){useEffect(create(),[]);return <main/>;}"},reject('localStorage is not defined'));

for(const [kind,pre,value]of [
 ['arrow','const callback=()=>2;','callback'],['declaration','function callback(){return 2;}','callback'],['class','class Item {id=2;}','new Item()'],['prototype','const record={__proto__:null,id:2};','record'],['symbol','const identifier=Symbol("row");','identifier'],
])for(const [container,wrap]of [['field',x=>`{record:${x}}`],['nested array',x=>`[[${x}]]`],['set',x=>`new Set([${x}])`],['promise',x=>`Promise.resolve(${x})`]])add('NSG004',`${kind} in ${container}`,props(pre,wrap(value)),reject(kind==='symbol'?'[Ss]ymbol':kind==='class'||kind==='prototype'?'plain objects|classes|class instances|Only plain':'[Ff]unction|Event handlers'));

for(const [description,pre,value]of [
 ['aliased field in DTO','const account={credential:process.env.TOKEN};','{credential:account.credential}'],
 ['destructured nested field','const account={auth:{credential:process.env.TOKEN}};const {auth}=account;','auth.credential'],
 ['spread nested DTO','const account={auth:{credential:process.env.TOKEN}};','{...account}'],
 ['array in DTO','','{credentials:[process.env.TOKEN]}'],
 ['set in DTO','','{credentials:new Set([process.env.TOKEN])}'],
 ['map in DTO','','{credentials:new Map([["credential",process.env.TOKEN]])}'],
 ['helper parameter passthrough','function dto(value:any){return {credential:value};}','dto(process.env.TOKEN)'],
 ['helper returns nested DTO','function dto(){return {auth:{credential:process.env.TOKEN}};}','dto()'],
 ['helper alias parameter','function dto(value:any){const credential=value;return {credential};}','dto(process.env.TOKEN)'],
 ['string conversion in object','','{credential:String(process.env.TOKEN)}'],
 ['string combination in array','','[process.env.TOKEN+":suffix"]'],
 ['promise containing DTO','','Promise.resolve({credential:process.env.TOKEN})'],
 ['React children in attribute','','<label>{process.env.TOKEN}</label>'],
 ['React spread attributes','','<label {...{title:process.env.TOKEN}}>Catalog</label>'],
 ['resolved server renderer result','function Label({value}:any){return <label title={value}>Catalog</label>;}','<Label value={process.env.TOKEN}/>'],
])add('NSG005',description,props(pre,value),{kind:'payload-present'},{sensitive:secret});
add('NSG005','nested private export field',{'app/page.tsx':page("import Box from './box';import {account} from '../lib/account';",'<Box payload={account.profile.email}/>'),'app/box.tsx':box,'lib/account.ts':`export const account={profile:{email:'${token}',label:'Catalog'}};`},{kind:'payload-present'},{sensitive:{env:[],exports:[{file:'lib/account.ts',export:'account',field:['profile','email'],category:'private'}]}});
add('NSG005','declared default export field',{'app/page.tsx':page("import Box from './box';import account from '../lib/account';",'<Box payload={{email:account.email}}/>'),'app/box.tsx':box,'lib/account.ts':`const account={email:'${token}',label:'Catalog'};export default account;`},{kind:'payload-present'},{sensitive:{env:[],exports:[{file:'lib/account.ts',export:'default',field:['email'],category:'private'}]}});
add('NSG005','public config capability in nested client component',{'app/page.tsx':page("import Counter from './counter';",'<Counter/>'),'app/counter.tsx':page('','<main>{process.env.TOKEN}</main>',true)},{kind:'bundle-present'},{sensitive:secret,configEnv:{TOKEN:token}});
add('NSG005','declared JSON export field',{'app/page.tsx':page("import Box from './box';import account from '../lib/account.json';",'<Box payload={account.auth.credential}/>'),'app/box.tsx':box,'lib/account.json':JSON.stringify({auth:{credential:token},label:'Catalog'})},{kind:'payload-present'},{sensitive:{env:[],exports:[{file:'lib/account.json',export:'default',field:['auth','credential'],category:'private'}]}});
add('NSG005','action explicitly returns a nested confidential DTO',{'app/page.tsx':page("import {load} from './actions';",'<button onClick={()=>load()}>Load</button>',true),'app/actions.ts':"'use server';export async function load(){const credential=process.env.TOKEN;return {auth:{credential}};}"},{kind:'action-return'},{sensitive:secret});

for(const read of ['process.env.TOKEN',"process.env['TOKEN']"])for(const mode of ['local-alias','destructured-result','object-field','render-helper','event-helper','effect-helper','default-mjs','namespace-mjs','two-helpers','nested-client']){
 let files;
 if(mode==='default-mjs'||mode==='namespace-mjs')files={'app/page.tsx':page(mode==='default-mjs'?"import inspect from '../lib/env.mjs';":"import * as env from '../lib/env.mjs';",mode==='default-mjs'?'<main>{inspect()}</main>':'<main>{env.inspect()}</main>',true),'lib/env.mjs':mode==='default-mjs'?`export default function inspect(){return ${read};}`:`export function inspect(){return ${read};}`};
 else if(mode==='two-helpers')files={'app/page.tsx':page("import {inspect} from '../lib/a';",'<main>{inspect()}</main>',true),'lib/a.ts':"import {read} from './b';export function inspect(){return read();}",'lib/b.ts':`export function read(){return ${read};}`};
 else if(mode==='nested-client')files={'app/page.tsx':page("import Counter from './ui/counter';",'<Counter/>'),'app/ui/counter.tsx':page('',`<main>{${read}}</main>`,true)};
 else if(['render-helper','event-helper','effect-helper'].includes(mode))files={'app/page.tsx':page(`import {inspect} from '../lib/env';${mode==='effect-helper'?"import {useEffect} from 'react';":''}`,mode==='render-helper'?'<main>{inspect()}</main>':mode==='event-helper'?'<button onClick={()=>console.log(inspect())}>Inspect</button>':'<main/>',true),'lib/env.ts':`export function inspect(){return ${read};}`};
 else files={'app/page.tsx':page(mode==='local-alias'?`const value=${read};`:mode==='destructured-result'?`const config={value:${read}};const {value}=config;`:`const config={value:${read}};`,mode==='object-field'?'<main>{config.value}</main>':'<main>{value}</main>',true)};
 if(mode==='effect-helper')files['app/page.tsx']=`'use client';import {inspect} from '../lib/env';import {useEffect} from 'react';export default function Catalog(){useEffect(()=>{console.log(inspect());},[]);return <main/>;}`;
 add('NSG006',`private environment ${mode} ${read.includes('[')?'bracket':'dot'}`,files,{kind:'bundle-absent-private',pattern:'TOKEN'});
}

for(const [description,files]of [
 ['explicit server marker type import',{'app/page.tsx':page("import type {Row} from '../lib/dal';",undefined,true),'lib/dal.ts':"import 'server-only';export type Row={id:number};"}],
 ['filesystem ordinary import used only as a type',{'app/page.tsx':page("import {Stats} from 'node:fs';type Row=Stats;",undefined,true)}],
 ['filesystem namespace unused and elided',{'app/page.tsx':page("import * as disk from 'fs/promises';",undefined,true)}],
 ['server marker behind action reference',{'app/page.tsx':page("import {load} from './actions';",'<button onClick={()=>load()}>Load</button>',true),'app/actions.ts':"'use server';import 'server-only';export async function load(){return {count:2};}"}],
 ['pure namespace helper in client',{'app/page.tsx':page("import * as data from '../lib/data';",'<main>{data.count}</main>',true),'lib/data.ts':"export const count=2;"}],
 ['server filesystem summary in server helper',{'app/page.tsx':page("import {inspect} from '../lib/data';",'<main>{String(inspect())}</main>'),'lib/data.ts':"import {existsSync} from 'node:fs';export function inspect(){return existsSync('fictional.txt');}"}],
])add('NSG001',description,files,{kind:'accepted-build'},{clean:true});
for(const [description,files]of [
 ['state in nested client component',{'app/page.tsx':page("import Counter from './counter';",'<Counter/>'),'app/counter.tsx':"'use client';import {useState as state} from 'react';export default function Counter(){const [v]=state(2);return <main>{v}</main>;}"}],
 ['effect in transitive JS helper',{'app/page.tsx':page("import {Counter} from '../lib/ui';",'<Counter/>',true),'lib/ui.jsx':"import {useEffect} from 'react';export function Counter(){useEffect(()=>{},[]);return <main/>;}"}],
 ['router behind real client directive',{'app/page.tsx':page("import {useRouter} from 'next/navigation';",'<button onClick={()=>useRouter}>Inspect</button>',true)}],
 ['local reducer-like function',{'app/page.tsx':page('function useReducer(value:number){return value;}','<main>{useReducer(2)}</main>')}],
 ['React hook reexport not executed',{'app/page.tsx':page("import {count} from '../lib/ui';",'<main>{count}</main>'),'lib/ui.ts':"export {useReducer as reducer} from 'react';export const count=2;"}],
 ['client marker within nested client subtree',{'app/page.tsx':page("import Counter from './counter';",'<Counter/>'),'app/counter.tsx':page("import '../lib/browser';",undefined,true),'lib/browser.ts':"import 'client-only';export type Size=number;"}],
])add('NSG002',description,files,{kind:'accepted-build'},{clean:true});
for(const [description,source]of [
 ['factory returns deferred browser read',"function create(){return ()=>document.title;}export default function Catalog(){return <button onClick={create()}>Inspect</button;}"],
 ['effect contains helper browser read',"import {useEffect} from 'react';function inspect(){return localStorage.length;}export default function Catalog(){useEffect(()=>{inspect();},[]);return <main/>;}"],
 ['event callback contains helper browser read',"function inspect(){return window.location.href;}export default function Catalog(){return <button onClick={()=>inspect()}>Inspect</button;}"],
 ['early-return guard dominates document read',"export default function Catalog(){if(typeof window==='undefined')return <main/>;return <main>{document.title}</main>;}"],
 ['negated window guard',"export default function Catalog(){if(!(typeof window==='undefined'))return <main>{window.location.href}</main>;return <main/>;}"],
 ['parameter shadows browser global',"function inspect(document:{title:string}){return document.title;}export default function Catalog(){return <main>{inspect({title:'Catalog'})}</main>;}"],
])add('NSG003',description,{'app/page.tsx':`'use client';${source}`},{kind:'accepted-build'},{clean:true});
for(const [description,pre,value]of [
 ['ArrayBuffer','','new ArrayBuffer(8)'],['typed array','','new Uint8Array([1,2])'],['DataView','','new DataView(new ArrayBuffer(8))'],['Map with Date','','new Map([["date",new Date("2026-02-01")]])'],['Set of global symbols','','new Set([Symbol.for("catalog")])'],['Server Function reference',"import {load} from './actions';",'load'],
])add('NSG004',description,{...props(pre,value),...description==='Server Function reference'?{'app/actions.ts':"'use server';export async function load(){return 2;}"}:{}},{kind:'accepted-build'},{clean:true});
for(const [description,files,options]of [
 ['helper DTO omits confidential field',props('function dto(){const account={credential:process.env.TOKEN,label:"Catalog"};return {label:account.label};}','dto()'),{sensitive:secret}],
 ['nested server renderer discards input',props('function Label({value}:any){return <label>Catalog</label>;}','<Label value={process.env.TOKEN}/>'),{sensitive:secret}],
 ['array DTO extracts public field',props('const account={credential:process.env.TOKEN,label:"Catalog"};','[account.label]'),{sensitive:secret}],
 ['private export field is omitted',{'app/page.tsx':page("import Box from './box';import {account} from '../lib/account';",'<Box payload={{label:account.profile.label}}/>'),'app/box.tsx':box,'lib/account.ts':`export const account={profile:{email:'${token}',label:'Catalog'}};`},{sensitive:{env:[],exports:[{file:'lib/account.ts',export:'account',field:['profile','email'],category:'private'}]}}],
 ['configuration publishes nonconfidential value',{'app/page.tsx':page('','<main>{process.env.LABEL}</main>',true)},{configEnv:{LABEL:'Catalog'}}],
 ['referenced action returns public nested DTO',{'app/page.tsx':page("import {load} from './actions';",'<button onClick={()=>load()}>Load</button>',true),'app/actions.ts':"'use server';export async function load(){const account={credential:process.env.TOKEN,label:'Catalog'};return {profile:{label:account.label}};}"},{sensitive:secret}],
])add('NSG005',description,files,{kind:'payload-absent'},{clean:true,...options});
for(const [description,files,options]of [
 ['private read in server helper',{'app/page.tsx':page("import {inspect} from '../lib/env';",'<main>{inspect()?"Configured":"Unset"}</main>'),'lib/env.ts':"export function inspect(){return process.env.TOKEN;}"},{}],
 ['public read in mjs helper',{'app/page.tsx':page("import inspect from '../lib/env.mjs';",'<main>{inspect()}</main>',true),'lib/env.mjs':"export default function inspect(){return process.env.NEXT_PUBLIC_LABEL;}"},{}],
 ['public read in effect',{'app/page.tsx':"'use client';import {useEffect} from 'react';export default function Catalog(){useEffect(()=>{console.log(process.env.NEXT_PUBLIC_LABEL);},[]);return <main/>;}"},{}],
 ['public config in shared helper',{'app/page.tsx':page("import {inspect} from '../lib/env';",'<main>{inspect()}</main>',true),'lib/env.ts':"export function inspect(){return process.env.LABEL;}"},{configEnv:{LABEL:'Catalog'}}],
 ['NODE_ENV read in namespace helper',{'app/page.tsx':page("import * as env from '../lib/env';",'<main>{env.inspect()}</main>',true),'lib/env.ts':"export function inspect(){return process.env.NODE_ENV;}"},{}],
 ['pure mjs helper constant',{'app/page.tsx':page("import * as data from '../lib/data.mjs';",'<main>{data.count}</main>',true),'lib/data.mjs':"export const count=2;"},{}],
])add('NSG006',description,files,{kind:'accepted-build'},{clean:true,...options});
