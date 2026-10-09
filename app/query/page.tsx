import QueryForm from '@/components/QueryForm';

export const metadata = {
  title: '查询退款进度'
};

export default function QueryPage() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <QueryForm />
    </main>
  );
}
