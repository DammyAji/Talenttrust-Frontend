import { notFound } from 'next/navigation';
import OnChainEscrowActions from '@/components/onchain/OnChainEscrowActions';
import { WalletProvider } from '@/contexts/WalletContext';

type Props = { params: Promise<{ id: string }> };

export default async function OnChainContractPage({ params }: Props) {
  const { id } = await params;
  const parsed = parseInt(id, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== id) {
    notFound();
  }
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <WalletProvider>
        <OnChainEscrowActions id={parsed} />
      </WalletProvider>
    </div>
  );
}
