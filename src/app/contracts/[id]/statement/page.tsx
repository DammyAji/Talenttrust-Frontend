import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { site, explorerUrl } from '@/lib/site';
import type { EscrowContract } from '@/lib/api';
import { buildStatement } from '@/lib/statement';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Escrow statement' };

async function fetchContract(id: number): Promise<EscrowContract | null> {
  const res = await fetch(`${site.apiUrl}/api/v1/contracts/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load contract (${res.status})`);
  const data = (await res.json().catch(() => ({}))) as { data?: EscrowContract };
  return data.data ?? null;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const contract = await fetchContract(numericId);
  if (!contract) notFound();

  const statement = buildStatement(contract);
  const { totals } = statement;

  return (
    <div className="container statement">
      <div className="statement-toolbar">
        <Link href="/contracts" className="btn btn-secondary btn-sm">
          Back to dashboard
        </Link>
        <PrintButton />
      </div>

      <header className="statement-head">
        <p className="eyebrow">Escrow statement</p>
        <h1>
          #{statement.id} {statement.title}
        </h1>
        <p className="muted">
          Status: <strong>{statement.inProgress ? 'In progress' : statement.status}</strong> &middot; {statement.token} &middot;
          Stellar {site.network}
        </p>
      </header>

      <dl className="statement-meta">
        <div>
          <dt>Escrow ID</dt>
          <dd>#{statement.id}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statement.inProgress ? 'In progress' : statement.status}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(statement.createdAt)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(statement.updatedAt)}</dd>
        </div>
        <div>
          <dt>Client</dt>
          <dd className="mono">{statement.client}</dd>
        </div>
        <div>
          <dt>Freelancer</dt>
          <dd className="mono">{statement.freelancer}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>Stellar {site.network}</dd>
        </div>
        <div>
          <dt>Contract ID</dt>
          <dd className="mono">
            <a href={explorerUrl}>{site.contractId}</a>
          </dd>
        </div>
        {statement.dispute && (
          <div>
            <dt>Dispute raised by</dt>
            <dd className="mono">{statement.dispute.raisedBy}</dd>
          </div>
        )}
        {statement.dispute?.resolvedAt && (
          <div>
            <dt>Dispute resolved</dt>
            <dd>{formatDate(statement.dispute.resolvedAt)}</dd>
          </div>
        )}
      </dl>

      <section className="statement-section">
        <h2>Payout ledger</h2>
        <div className="table-wrap">
          <table className="statement-table">
            <caption className="sr-only">Payout ledger for escrow {statement.id}</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Payee</th>
                <th scope="col" className="num">
                  Amount ({statement.token})
                </th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No payouts recorded yet.
                  </td>
                </tr>
              ) : (
                statement.lines.map((line, i) => (
                  <tr key={`${line.label}-${i}`}>
                    <td>
                      {line.label}
                      {line.note && <span className="statement-note"> — {line.note}</span>}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{line.to === 'escrow' ? 'Escrow' : line.to}</td>
                    <td className="num mono">{line.amount}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  Total accounted for
                </th>
                <td className="num mono">
                  <strong>{totals.total}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="statement-totals">
          <div>
            <span className="muted small">Paid to freelancer</span>
            <strong className="mono">
              {totals.toFreelancer} {statement.token}
            </strong>
          </div>
          <div>
            <span className="muted small">Refunded to client</span>
            <strong className="mono">
              {totals.toClient} {statement.token}
            </strong>
          </div>
          <div>
            <span className="muted small">Still in escrow / unfunded</span>
            <strong className="mono">
              {totals.held} {statement.token}
            </strong>
          </div>
          <div>
            <span className="muted small">Total budget</span>
            <strong className="mono">
              {totals.total} {statement.token}
            </strong>
          </div>
        </div>
        <p className="small muted">
          Totals reconcile to the escrow budget: paid to freelancer + refunded to client + still in escrow equals the total
          budget. Funds released before a cancellation are not refunded.
        </p>
      </section>
    </div>
  );
}
