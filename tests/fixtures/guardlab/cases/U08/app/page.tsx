'use client';
declare function callback(fn: () => unknown): void;
export default function Page() { callback(()=>window.location.href);return <p/>; }
