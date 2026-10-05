'use client';
import { useEffect, useState } from 'react';
export default function Page() { const [title, setTitle] = useState(''); useEffect(() => { setTitle(document.title); }, []); return <p>{title}</p>; }
