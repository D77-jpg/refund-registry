import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: '后台登录' };

export default function AdminLoginPage() {
  if (isAuthenticated()) redirect('/admin');
  return (
    <main className="grid place-items-center bg-gradient-to-b from-ink-50 via-white to-brand-50/40 px-4 py-12">
      <LoginForm usingDefaultPassword={!process.env.ADMIN_PASSWORD} />
    </main>
  );
}
