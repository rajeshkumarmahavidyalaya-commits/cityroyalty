'use client';
import { use } from 'react';
import { ProductEditor } from '@/components/ProductEditor';
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductEditor id={id} />;
}
