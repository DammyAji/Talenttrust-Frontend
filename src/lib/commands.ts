import nav from '@/lib/nav.json';
import { site, apiDocsUrl } from '@/lib/site';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Escrows' | 'Reputation' | 'Actions' | 'Recent';
  href?: string;
  actionType?: 'copy-contract' | 'open-docs';
  shortcut?: string;
}

export const staticCommands: CommandItem[] = [
  ...nav.map((item) => ({
    id: `nav-${item.href}`,
    title: item.label,
    subtitle: item.href,
    category: 'Navigation' as const,
    href: item.href,
  })),
  {
    id: 'action-copy-contract',
    title: 'Copy contract ID',
    subtitle: site.contractId,
    category: 'Actions' as const,
    actionType: 'copy-contract' as const,
  },
  {
    id: 'action-open-docs',
    title: 'Open API documentation',
    subtitle: apiDocsUrl,
    category: 'Actions' as const,
    actionType: 'open-docs' as const,
  },
];

export function parseDynamicCommands(query: string): CommandItem[] {
  const trimmed = query.trim();
  const dynamic: CommandItem[] = [];

  // Match escrow ID (#12 or 12)
  const escrowMatch = trimmed.match(/^#?(\d+)$/);
  if (escrowMatch) {
    const id = escrowMatch[1];
    dynamic.push({
      id: `dynamic-escrow-${id}`,
      title: `Go to escrow #${id}`,
      subtitle: `/contracts?q=${id}`,
      category: 'Escrows',
      href: `/contracts?q=${id}`,
    });
  }

  // Match Stellar public key (56 chars starting with G)
  const isStellarAddress = /^G[A-Z0-9]{55}$/.test(trimmed);
  if (isStellarAddress) {
    const short = `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
    dynamic.push({
      id: `dynamic-reputation-${trimmed}`,
      title: `Look up reputation for ${short}`,
      subtitle: trimmed,
      category: 'Reputation',
      href: `/reputation?address=${trimmed}`,
    });
  }

  return dynamic;
}

export function rankCommands(query: string, commands: CommandItem[]): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;

  return commands
    .map((item) => {
      const title = item.title.toLowerCase();
      const subtitle = (item.subtitle || '').toLowerCase();
      const titleWords = title.split(/\s+/);

      let score = 0;
      if (title === q) {
        score = 100;
      } else if (title.startsWith(q)) {
        score = 80;
      } else if (titleWords.some((w) => w.startsWith(q))) {
        score = 60;
      } else if (subtitle.startsWith(q)) {
        score = 50;
      } else if (title.includes(q)) {
        score = 30;
      } else if (subtitle.includes(q)) {
        score = 20;
      }

      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

const RECENT_KEY = 'tt_recent_commands';

export function getRecentCommands(): CommandItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 5);
    }
    return [];
  } catch {
    return [];
  }
}

export function saveRecentCommand(command: CommandItem): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentCommands();
    const filtered = existing.filter((c) => c.id !== command.id);
    const updated = [
      {
        id: command.id,
        title: command.title,
        subtitle: command.subtitle,
        category: 'Recent' as const,
        href: command.href,
        actionType: command.actionType,
      },
      ...filtered,
    ].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // localStorage quota or access error
  }
}
