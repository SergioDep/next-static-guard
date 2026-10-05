import { read } from '../lib/read';
export default async function Page() { await read(); return <p>Headers read on server</p>; }
