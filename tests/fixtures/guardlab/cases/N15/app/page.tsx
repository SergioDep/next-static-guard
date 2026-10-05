import Client from './client';
export default function Page() { return <Client date={new Date()} map={new Map([['a',1]])} set={new Set([1,2])}/>; }
