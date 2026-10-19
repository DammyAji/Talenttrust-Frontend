import React from 'react';
import { render, screen } from '@testing-library/react';

const mockNotFound = jest.fn();
jest.mock('next/navigation', () => ({
  notFound: () => {
    mockNotFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

jest.mock('@/components/onchain/OnChainEscrowActions', () => ({
  __esModule: true,
  default: ({ id }: { id: number }) => (
    <div data-testid="onchain-actions">id={id}</div>
  ),
}));

import OnChainContractPage from '../page';

beforeEach(() => mockNotFound.mockClear());

describe('OnChainContractPage', () => {
  it('renders OnChainEscrowActions with the parsed id', () => {
    render(<OnChainContractPage params={{ id: '42' }} />);
    expect(screen.getByTestId('onchain-actions')).toHaveTextContent('id=42');
  });

  it('calls notFound for non-numeric id', () => {
    expect(() =>
      render(<OnChainContractPage params={{ id: 'abc' }} />)
    ).toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('calls notFound for id=0', () => {
    expect(() =>
      render(<OnChainContractPage params={{ id: '0' }} />)
    ).toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound for negative id', () => {
    expect(() =>
      render(<OnChainContractPage params={{ id: '-1' }} />)
    ).toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound for float id', () => {
    expect(() =>
      render(<OnChainContractPage params={{ id: '1.5' }} />)
    ).toThrow('NEXT_NOT_FOUND');
  });

  it('renders id=1 correctly', () => {
    render(<OnChainContractPage params={{ id: '1' }} />);
    expect(screen.getByTestId('onchain-actions')).toHaveTextContent('id=1');
  });
});
