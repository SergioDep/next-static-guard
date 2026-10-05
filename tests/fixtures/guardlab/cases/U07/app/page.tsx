import Client from './client';
declare function transform(input: unknown): unknown;
export default function Page() { return <Client data={transform(process.env.TOKEN)}/>; }
