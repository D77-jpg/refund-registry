import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import AdminWorkbench from '@/components/AdminWorkbench';

export const dynamic = 'force-dynamic';
export const metadata = { title: '退款核实后台' };

export default function AdminPage() {
  if (!isAuthenticated()) redirect('/admin/login');
  const usingDefaultPassword = !process.env.ADMIN_PASSWORD;
  return (
    <main className="px-3 py-5 sm:px-6 sm:py-8">
      <AdminWorkbench usingDefaultPassword={usingDefaultPassword} />
    </main>
  );
}
