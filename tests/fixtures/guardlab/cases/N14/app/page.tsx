import Client from './client';
export default function Page() { async function action(){'use server';return 1;}return <Client action={action}/>; }
