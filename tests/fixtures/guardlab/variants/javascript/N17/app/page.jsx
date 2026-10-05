export default function Page() { return <p>{process.env.TOKEN ? "configured" : "missing"}</p>; }
