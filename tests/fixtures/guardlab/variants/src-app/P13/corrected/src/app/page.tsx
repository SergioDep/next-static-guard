import Client from './client';
export default function Page() { async function handler() { 'use server'; return 1; } return <Client handler={handler}/>; }
