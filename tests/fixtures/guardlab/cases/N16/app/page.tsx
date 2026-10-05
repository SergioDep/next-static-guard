import Client from './client';
export default function Page() { return <Client element={<span>ok</span>} promise={Promise.resolve(1)} symbol={Symbol.for('shared')}/>; }
