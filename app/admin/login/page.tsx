import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: '后台登录' };

export default function AdminLoginPage() {
  if (isAuthenticated()) redirect('/admin');
  return (
    <main className="px-4 py-12">
      <LoginForm usingDefaultPassword={!process.env.ADMIN_PASSWORD} />
    </main>
  );
}
