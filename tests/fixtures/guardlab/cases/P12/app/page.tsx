'use client';
import { useMemo } from 'react';
export default function Page() { const item=useMemo(()=>window.location.href,[]);return <p>{item}</p>; }
