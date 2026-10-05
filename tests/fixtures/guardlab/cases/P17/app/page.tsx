import Client from './client';
export default function Page() { const value=process.env.TOKEN;return <Client data={value}/>; }
