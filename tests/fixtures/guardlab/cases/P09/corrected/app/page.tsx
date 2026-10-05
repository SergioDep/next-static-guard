'use client';
import { useEffect, useState } from 'react';
export default function Page() { const [href, setHref] = useState(''); useEffect(() => { setHref(window.location.href); }, []); return <p>{href}</p>; }
