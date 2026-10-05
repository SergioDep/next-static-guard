import Client from './client';
export default function Page() { return <Client data={[Symbol.for('local')]}/>; }
