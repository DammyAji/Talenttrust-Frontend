# TalentTrust Frontend

## Live

- Website: https://talenttrust-frontend.vercel.app
- Docs: https://talenttrust-frontend.vercel.app/docs
- API: https://talenttrust-backend.vercel.app (Swagger UI at [/docs](https://talenttrust-backend.vercel.app/docs))
- Contract (Stellar testnet): [`CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W`](https://stellar.expert/explorer/testnet/contract/CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W)

Web app for TalentTrust, a milestone-based freelancer escrow protocol on Stellar. Built with Next.js
(App Router), React and plain CSS with automatic light/dark themes.

## Pages

| Route | Description |
| --- | --- |
| `/` | Product landing page: how it works, features, live deployment details |
| `/contracts` | Escrow dashboard: create, fund, release, dispute, cancel and rate against the live API |
| `/reputation` | Freelancer reputation lookup |
| `/docs` | Product overview, architecture, lifecycle, usage, API and contract reference |

## Configuration

All optional (defaults point at the live deployments), see `.env.example`:

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://talenttrust-backend.vercel.app` |
| `NEXT_PUBLIC_CONTRACT_ID` | `CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |

## Development

```bash
npm ci
npm run dev     # http://localhost:3000
npm run lint    # type check
npm test        # verifies internal links and runs the Vitest unit tests
npm run build
```

## Deployment

Deployed on Vercel (`vercel deploy --prod`).

## License

MIT
