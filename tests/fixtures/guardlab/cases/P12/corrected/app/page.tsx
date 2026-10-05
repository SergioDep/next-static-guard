'use client';
import { useEffect, useState } from 'react';
export default function Page() { const [item, setItem] = useState(''); useEffect(() => { setItem(window.location.href); }, []); return <p>{item}</p>; }
