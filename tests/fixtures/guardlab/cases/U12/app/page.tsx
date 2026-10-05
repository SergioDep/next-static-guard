import Client from './client';
function d(){return 1;}
function c(){return d();}
function b(){return c();}
function a(){return b();}
export default function Page() { return <Client data={a()}/>; }
