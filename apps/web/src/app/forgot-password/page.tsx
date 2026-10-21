import type { Metadata } from 'next';
import { AuthForm } from '@/components/account/AuthForms';

export const metadata: Metadata = { title: 'Forgot password', robots: { index: false } };
export default function Page() {
  return <AuthForm mode="forgot" />;
}
