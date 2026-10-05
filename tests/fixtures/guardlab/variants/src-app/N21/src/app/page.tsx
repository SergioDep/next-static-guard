export default function Page() { return <p>{process.env.TOKEN ? "set" : "unset"}</p>; }
