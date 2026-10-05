import Client from './client';
class Account { value=1; }
export default function Page() { return <Client data={{account:new Account()}}/>; }
