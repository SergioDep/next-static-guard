// Two v2 misses used to repair shorthand binding resolution; never reserved again.
export {originalSources} from './cases.mjs';
export const cases=[
  {
    "id": "V2-NSG005-P09",
    "rule": "NSG005",
    "description": "helper alias parameter",
    "expected": "finding",
    "oracle": {
      "kind": "payload-present"
    },
    "reference": "https://nextjs.org/docs/app/guides/data-security",
    "files": {
      "app/page.tsx": "import Box from './box';function dto(value:any){const credential=value;return {credential};}export default function Catalog(){return <Box payload={dto(process.env.TOKEN)}/>;}",
      "app/box.tsx": "'use client';export default function Box(props:any){return <section>Catalog</section>;}"
    },
    "sensitive": {
      "env": [
        {
          "name": "TOKEN",
          "category": "secret"
        }
      ],
      "exports": []
    }
  },
  {
    "id": "V2-NSG005-P20",
    "rule": "NSG005",
    "description": "action explicitly returns a nested confidential DTO",
    "expected": "finding",
    "oracle": {
      "kind": "action-return"
    },
    "reference": "https://nextjs.org/docs/app/guides/data-security",
    "files": {
      "app/page.tsx": "'use client';import {load} from './actions';export default function Catalog(){return <button onClick={()=>load()}>Load</button>;}",
      "app/actions.ts": "'use server';export async function load(){const credential=process.env.TOKEN;return {auth:{credential}};}"
    },
    "sensitive": {
      "env": [
        {
          "name": "TOKEN",
          "category": "secret"
        }
      ],
      "exports": []
    }
  }
];
