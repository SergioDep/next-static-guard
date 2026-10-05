import Client from './client';
import { read } from '../lib/read';
export default function Page() { const value = read() ? 'Configured' : 'Missing configuration'; return <><Client value={value}/><p>{value}</p></>; }
