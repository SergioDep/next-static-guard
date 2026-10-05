import Client from './client';
import { read } from '../lib/read';
export default function Page() { return <><Client/><p>{read()}</p></>; }
