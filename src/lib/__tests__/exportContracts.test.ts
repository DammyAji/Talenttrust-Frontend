import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import {
  buildExport,
  CONTRACT_HEADERS,
  contractsToRows,
  downloadCsv,
  exportFilename,
  MILESTONE_HEADERS,
  milestonesToRows,
} from '@/lib/exportContracts';
import { disputed, readBlob, resolved } from '@/test/exportFixtures';

describe('contractsToRows', () => {
  it('maps a disputed and a resolved contract', () => {
    expect(contractsToRows([disputed, resolved])).toEqual([
      [
        7, '=HYPERLINK("http://evil")', 'Disputed', 'GCLIENT7', 'GFREE7', 'XLM', 1000, 1000, 300, 700, 2,
        '2026-10-01T09:00:00.000Z', '2026-10-02T10:00:00.000Z', 'GCLIENT7', 'Late "final" delivery\nsee chat',
      ],
      [
        8, 'Логотип café', 'Resolved', 'GCLIENT8', 'GFREE8', 'XLM', 500, 500, 500, 0, 1,
        '2026-10-03T09:00:00.000Z', '2026-10-04T10:00:00.000Z', 'GFREE8', 'No reason given',
      ],
    ]);
    expect(CONTRACT_HEADERS).toHaveLength(15);
  });

  it('leaves dispute and date cells empty when the API does not send them', () => {
    const plain: EscrowContract = { ...resolved, status: 'Funded', dispute: undefined, createdAt: undefined, updatedAt: undefined };
    expect(contractsToRows([plain])[0].slice(-4)).toEqual([undefined, undefined, undefined, undefined]);
    expect(buildExport('escrows', [plain]).endsWith(',1,,,,')).toBe(true);
  });

  it('counts missing milestones as 0', () => {
    const broken = { ...resolved, milestones: undefined } as unknown as EscrowContract;
    expect(contractsToRows([broken])[0][10]).toBe(0);
    expect(milestonesToRows([broken])).toEqual([]);
  });
});

describe('milestonesToRows', () => {
  it('writes one row per milestone', () => {
    expect(milestonesToRows([disputed, resolved])).toEqual([
      [7, '=HYPERLINK("http://evil")', 0, 'Design, v1', 300, true],
      [7, '=HYPERLINK("http://evil")', 1, '-Build', 700, false],
      [8, 'Логотип café', 0, 'Logo', 500, false],
    ]);
    expect(MILESTONE_HEADERS).toHaveLength(6);
  });
});

describe('buildExport', () => {
  it('escapes and sanitises the escrow CSV', () => {
    const lines = buildExport('escrows', [disputed]).split('\r\n');
    expect(lines[0]).toBe(CONTRACT_HEADERS.join(','));
    expect(lines[1]).toBe(
      `7,"'=HYPERLINK(""http://evil"")",Disputed,GCLIENT7,GFREE7,XLM,1000,1000,300,700,2,` +
        `2026-10-01T09:00:00.000Z,2026-10-02T10:00:00.000Z,GCLIENT7,"Late ""final"" delivery\nsee chat"`,
    );
  });

  it('sanitises milestone titles', () => {
    expect(buildExport('milestones', [disputed]).split('\r\n')).toEqual([
      MILESTONE_HEADERS.join(','),
      `7,"'=HYPERLINK(""http://evil"")",0,"Design, v1",300,true`,
      `7,"'=HYPERLINK(""http://evil"")",1,'-Build,700,false`,
    ]);
  });
});

describe('exportFilename', () => {
  it('uses the local date', () => {
    expect(exportFilename(new Date(2026, 0, 5, 23, 59))).toBe('talenttrust-escrows-2026-01-05.csv');
  });
});

describe('downloadCsv', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads a UTF-8 Blob with a BOM and revokes the URL', async () => {
    const create = vi.fn((_: Blob) => 'blob:test');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    downloadCsv('a,b\r\n1,é', 'x.csv');

    const blob = create.mock.calls[0][0];
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const bytes = await readBlob(blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('a,b\r\n1,é');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('x.csv');
    expect(clicked[0].href).toBe('blob:test');
    expect(revoke).toHaveBeenCalledWith('blob:test');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
