'use client';
import { read } from "../lib/read.mjs";
export default function Page() { return <p>{read()}</p>; }
