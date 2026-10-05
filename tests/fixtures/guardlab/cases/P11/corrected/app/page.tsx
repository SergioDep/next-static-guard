'use client';
import { useEffect, useState } from 'react';
export default function Page() { const [item, setItem] = useState(''); useEffect(() => { setItem(localStorage.getItem('cart') ?? ''); }, []); return <p>{item}</p>; }
