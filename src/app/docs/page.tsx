import type { Metadata } from 'next';
import Link from 'next/link';
import { site, explorerUrl, apiDocsUrl } from '@/lib/site';
import { DocsToc } from '@/components/docs/DocsToc';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { DocHeading } from '@/components/docs/DocHeading';

export const metadata: Metadata = { title: 'Docs' };

const toc: Array<[string, string]> = [
  ['overview', 'Overview'],
  ['architecture', 'Architecture'],
  ['lifecycle', 'Escrow lifecycle'],
  ['how-to', 'How to use'],
  ['api', 'API'],
  ['contract', 'Smart contract'],
  ['deployments', 'Deployments'],
];

export default function DocsPage() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>Documentation</h1>
        <p>Everything you need to understand, use and integrate TalentTrust.</p>
      </div>
      <div className="docs">
        <DocsToc items={toc} />
        <div className="prose">
          <section id="overview">
            <DocHeading id="overview" title="Overview" />
            <p>
              <strong>TalentTrust</strong> is a decentralized escrow protocol for freelance work on Stellar. A client locks
              the project budget into a Soroban smart contract, the work is split into milestones, and each milestone is
              paid out to the freelancer when the client approves it. If something goes wrong either party can open a
              dispute that an arbiter settles by splitting the held funds. Completed engagements produce a rating that
              builds the freelancer&apos;s on-chain reputation.
            </p>
          </section>

          <section id="architecture">
            <DocHeading id="architecture" title="Architecture" />
            <p>The system has three parts, each in its own repository:</p>
            <div className="arch">
              <div className="card">
                <h3>Web app</h3>
                <p className="small">Next.js site (this app): landing, escrow dashboard, reputation lookup, docs.</p>
              </div>
              <div className="card">
                <h3>REST API</h3>
                <p className="small">Express service on Vercel. Mirrors the contract state machine and serves OpenAPI docs.</p>
              </div>
              <div className="card">
                <h3>Escrow contract</h3>
                <p className="small">Rust Soroban contract on Stellar holding funds and enforcing every transition.</p>
              </div>
            </div>
            <p>
              The web app talks to the API over HTTPS (<code>{site.apiUrl}</code>). The API exposes the same operations as
              the contract, so integrators can prototype against the API and then submit the equivalent contract
              invocations from a wallet.
            </p>
          </section>

          <section id="lifecycle">
            <DocHeading id="lifecycle" title="Escrow lifecycle" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Meaning</th>
                    <th>Next</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Created</td><td>Milestones agreed, escrow not yet fully funded</td><td>Funded, Cancelled, Disputed</td></tr>
                  <tr><td>Funded</td><td>The full budget is held by the contract</td><td>Completed, Cancelled, Disputed</td></tr>
                  <tr><td>Completed</td><td>Every milestone was released to the freelancer</td><td>Rated (once)</td></tr>
                  <tr><td>Disputed</td><td>Frozen until the arbiter resolves it</td><td>Resolved</td></tr>
                  <tr><td>Resolved</td><td>Held balance split between the parties</td><td>-</td></tr>
                  <tr><td>Cancelled</td><td>Unreleased funds refunded to the client</td><td>-</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="how-to">
            <DocHeading id="how-to" title="How to use" />
            <h3>In the web app</h3>
            <ol>
              <li>
                Open the <Link href="/contracts">Escrows</Link> dashboard and create an engagement with a client address, a
                freelancer address and one or more milestones.
              </li>
              <li>Click <strong>Fund</strong> to deposit the remaining budget into escrow.</li>
              <li>Click <strong>Release next</strong> each time a milestone is approved.</li>
              <li>When all milestones are released, rate the freelancer from 1 to 5.</li>
              <li>
                Look up any freelancer&apos;s score on the <Link href="/reputation">Reputation</Link> page.
              </li>
            </ol>
            <h3>From the command line</h3>
            <CodeBlock>{`curl -X POST ${site.apiUrl}/api/v1/contracts \\
  -H 'content-type: application/json' \\
  -d '{"title":"Logo design","client":"GCLIENT...","freelancer":"GFREE...",
       "milestones":[{"title":"Concepts","amount":100},{"title":"Final","amount":200}]}'

curl -X POST ${site.apiUrl}/api/v1/contracts/1/deposit -H 'content-type: application/json' -d '{"amount":300}'
curl -X POST ${site.apiUrl}/api/v1/contracts/1/milestones/0/release`}</CodeBlock>
            <p className="small">
              Note: the hosted API keeps data in memory for demo purposes, so records can reset between deployments.
            </p>
          </section>

          <section id="api">
            <DocHeading id="api" title="API" />
            <p>
              Interactive Swagger documentation is served by the API itself at{' '}
              <a href={apiDocsUrl} target="_blank" rel="noreferrer">
                {apiDocsUrl}
              </a>{' '}
              and the raw spec at{' '}
              <a href={`${site.apiUrl}/openapi.json`} target="_blank" rel="noreferrer">
                /openapi.json
              </a>
              . Health status is available at{' '}
              <a href={`${site.apiUrl}/health`} target="_blank" rel="noreferrer">
                /health
              </a>
              .
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Endpoint</th><th>Description</th></tr>
                </thead>
                <tbody>
                  <tr><td><code>GET /api/v1/contracts</code></td><td>List escrows (filter by status or party)</td></tr>
                  <tr><td><code>POST /api/v1/contracts</code></td><td>Create an escrow</td></tr>
                  <tr><td><code>POST /api/v1/contracts/:id/deposit</code></td><td>Fund an escrow</td></tr>
                  <tr><td><code>POST /api/v1/contracts/:id/milestones/:i/release</code></td><td>Release a milestone</td></tr>
                  <tr><td><code>POST /api/v1/contracts/:id/dispute</code></td><td>Open a dispute</td></tr>
                  <tr><td><code>POST /api/v1/contracts/:id/resolve</code></td><td>Resolve a dispute</td></tr>
                  <tr><td><code>POST /api/v1/contracts/:id/cancel</code></td><td>Cancel and refund</td></tr>
                  <tr><td><code>POST /api/v1/contracts/:id/reputation</code></td><td>Rate the freelancer</td></tr>
                  <tr><td><code>GET /api/v1/reputation/:address</code></td><td>Reputation for an address</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="contract">
            <DocHeading id="contract" title="Smart contract" />
            <p>
              The escrow is a Rust Soroban contract. Key functions: <code>initialize</code>, <code>create_contract</code>,{' '}
              <code>deposit_funds</code>, <code>release_milestone</code>, <code>open_dispute</code>,{' '}
              <code>resolve_dispute</code>, <code>cancel_contract</code>, <code>issue_reputation</code>,{' '}
              <code>get_contract</code> and <code>get_reputation</code>. Deposits and releases perform real token
              transfers through the Stellar Asset Contract interface, and an admin circuit breaker can pause all
              mutations.
            </p>
            <CodeBlock>{`stellar contract invoke --id ${site.contractId} \\
  --source <your-key> --network ${site.network} -- get_admin`}</CodeBlock>
          </section>

          <section id="deployments">
            <DocHeading id="deployments" title="Deployments" />
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr>
                    <th>Escrow contract</th>
                    <td>
                      <a href={explorerUrl} target="_blank" rel="noreferrer">
                        <code>{site.contractId}</code>
                      </a>{' '}
                      (Stellar {site.network})
                    </td>
                  </tr>
                  <tr>
                    <th>API</th>
                    <td>
                      <a href={site.apiUrl} target="_blank" rel="noreferrer">{site.apiUrl}</a>
                    </td>
                  </tr>
                  <tr>
                    <th>Source code</th>
                    <td>
                      <a href={site.github} target="_blank" rel="noreferrer">{site.github}</a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
