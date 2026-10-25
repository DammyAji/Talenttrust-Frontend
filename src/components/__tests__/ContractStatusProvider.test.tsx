import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readContractStatus } = vi.hoisted(() => ({
  readContractStatus: vi.fn(),
}));

vi.mock('@/lib/stellar/status', () => ({ readContractStatus }));

import { ContractStatusProvider, useContractStatus } from '@/components/ContractStatusProvider';

function Probe() {
  const { status, version, refresh } = useContractStatus();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="version">{version ?? 'none'}</span>
      <button type="button" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <ContractStatusProvider>
      <Probe />
    </ContractStatusProvider>,
  );

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('ContractStatusProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readContractStatus.mockReset();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks on mount and exposes an operational status', async () => {
    readContractStatus.mockResolvedValue({
      paused: false,
      version: 1,
      checkedAt: new Date().toISOString(),
    });

    renderProvider();
    await settle();

    expect(readContractStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status')).toHaveTextContent('operational');
    expect(screen.getByTestId('version')).toHaveTextContent('1');
  });

  it('re-checks every 60 seconds while visible', async () => {
    readContractStatus.mockResolvedValue({
      paused: false,
      version: 1,
      checkedAt: new Date().toISOString(),
    });

    renderProvider();
    await settle();
    expect(readContractStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(59_999);
    });
    expect(readContractStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    await settle();

    expect(readContractStatus).toHaveBeenCalledTimes(2);
  });

  it('pauses polling while hidden and re-checks immediately when visible', async () => {
    readContractStatus.mockResolvedValue({
      paused: false,
      version: 1,
      checkedAt: new Date().toISOString(),
    });

    renderProvider();
    await settle();
    expect(readContractStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility('hidden');
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(readContractStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
    });
    await settle();
    expect(readContractStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    await settle();
    expect(readContractStatus).toHaveBeenCalledTimes(3);
  });

  it('reports unknown on RPC failure and allows a manual retry', async () => {
    readContractStatus
      .mockRejectedValueOnce(new Error('RPC unavailable'))
      .mockResolvedValueOnce({ paused: true, version: 2, checkedAt: new Date().toISOString() });

    renderProvider();
    await settle();
    expect(screen.getByTestId('status')).toHaveTextContent('unknown');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await settle();

    expect(readContractStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('status')).toHaveTextContent('paused');
    expect(screen.getByTestId('version')).toHaveTextContent('2');
  });
});
