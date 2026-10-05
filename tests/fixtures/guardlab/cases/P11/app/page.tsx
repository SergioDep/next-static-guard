'use client';
import { useState } from 'react';
export default function Page() { const [item]=useState(()=>localStorage.getItem('cart'));return <p>{item}</p>; }
