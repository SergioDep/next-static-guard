import { read } from '../lib/read';
export default function Page() { return <p>{read() ? 'Configured' : 'Missing configuration'}</p>; }
