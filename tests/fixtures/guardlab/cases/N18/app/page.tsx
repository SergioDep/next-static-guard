import Client from './client';
import { profile } from '../lib/profile';
export default function Page() { return <Client data={{name:profile.name}}/>; }
