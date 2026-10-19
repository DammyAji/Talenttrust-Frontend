import { notFound } from 'next/navigation';
import OnChainEscrowActions from '@/components/onchain/OnChainEscrowActions';

type Props = { params: { id: string } };

export default function OnChainContractPage({ params }: Props) {
  const parsed = parseInt(params.id, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== params.id) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <OnChainEscrowActions id={parsed} />
      </div>
    </main>
  );
}
