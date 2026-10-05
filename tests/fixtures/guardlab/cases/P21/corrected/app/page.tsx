export default function Page() { return <p>{process.env.TOKEN ? 'Configured' : 'Missing configuration'}</p>; }
