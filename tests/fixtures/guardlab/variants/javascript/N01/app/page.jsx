'use client';
export default function Page() {
  /** @type {import('../lib/data').Data} */
  const item = { name: 'valid' };
  return <p>{item.name}</p>;
}
