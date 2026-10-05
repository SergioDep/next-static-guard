import { item } from '@lab/data';
export default function Page() { return <p>{item ? 'Configured' : 'Missing configuration'}</p>; }
