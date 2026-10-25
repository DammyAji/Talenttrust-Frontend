const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
const defaultRpcUrl = network === 'mainnet' ? 'https://soroban.stellar.org' : 'https://soroban-testnet.stellar.org';

export const site = {
  name: 'TalentTrust',
  tagline: 'Milestone escrow for freelancers, secured on Stellar.',
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || 'https://talenttrust-backend.vercel.app').replace(/\/$/, ''),
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID || 'CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W',
  network,
  rpcUrl: (process.env.NEXT_PUBLIC_STELLAR_RPC_URL || defaultRpcUrl).replace(/\/$/, ''),
  github: 'https://github.com/Talenttrust',
};

export const explorerUrl = `https://stellar.expert/explorer/${site.network}/contract/${site.contractId}`;
export const apiDocsUrl = `${site.apiUrl}/docs`;
