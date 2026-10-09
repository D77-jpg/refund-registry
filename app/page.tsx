import RefundForm from '@/components/RefundForm';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || '卡密退款登记';
  const deadlineNote = process.env.NEXT_PUBLIC_DEADLINE_NOTE || '';
  const supportContact = process.env.NEXT_PUBLIC_SUPPORT_CONTACT || '';

  return (
    <main className="px-4 py-6 sm:py-10">
      <RefundForm siteName={siteName} deadlineNote={deadlineNote} supportContact={supportContact} />
    </main>
  );
}
