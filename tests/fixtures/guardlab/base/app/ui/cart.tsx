'use client';
import { useState } from 'react';
export default function Cart({ title }: { title: string }) { const [count, setCount] = useState(0); return <button onClick={() => setCount(count + 1)}>{title}: {count}</button>; }
