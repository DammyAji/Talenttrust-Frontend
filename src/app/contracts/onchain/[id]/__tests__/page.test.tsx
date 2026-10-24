import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => {
    mockNotFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/components/onchain/OnChainEscrowActions', () => ({
  __esModule: true,
  default: ({ id }: { id: number }) => <div data-testid="onchain-actions">id={id}</div>,
}));

import OnChainContractPage from '../page';

const renderPage = async (id: string) => render(await OnChainContractPage({ params: Promise.resolve({ id }) }));

beforeEach(() => mockNotFound.mockClear());

describe('OnChainContractPage', () => {
  it('renders OnChainEscrowActions with the parsed id', async () => {
    await renderPage('42');
    expect(screen.getByTestId('onchain-actions')).toHaveTextContent('id=42');
  });

  it('calls notFound for non-numeric id', async () => {
    await expect(renderPage('abc')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('calls notFound for id=0', async () => {
    await expect(renderPage('0')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound for negative id', async () => {
    await expect(renderPage('-1')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound for float id', async () => {
    await expect(renderPage('1.5')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders id=1 correctly', async () => {
    await renderPage('1');
    expect(screen.getByTestId('onchain-actions')).toHaveTextContent('id=1');
  });
});
