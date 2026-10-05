'use client';
import { action } from './actions';
export default function Page() { return <button onClick={()=>action()}>Run</button>; }
