import RefundForm from '@/components/RefundForm';
import { cleanEnvText, siteNameFromEnv } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <RefundForm
        siteName={siteNameFromEnv()}
        deadlineNote={cleanEnvText(process.env.NEXT_PUBLIC_DEADLINE_NOTE)}
        supportContact={cleanEnvText(process.env.NEXT_PUBLIC_SUPPORT_CONTACT)}
      />
    </main>
  );
}
