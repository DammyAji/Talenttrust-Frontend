import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import 'vitest-axe/extend-expect';
import { EscrowCard } from '../escrow/EscrowCard';
import type { EscrowContract } from '@/lib/api';

const mockCreatedContract: EscrowContract = {
  id: 4,
  title: 'Website redesign',
  client: 'GCLIENT123456789012345678901234567890123456789012345678',
  freelancer: 'GFREELANCER123456789012345678901234567890123456789012',
  token: 'XLM',
  totalAmount: 1000,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
  milestones: [
    { index: 0, title: 'Design', amount: 300, released: false },
    { index: 1, title: 'Build', amount: 700, released: false },
  ],
};

const mockFundedContract: EscrowContract = {
  ...mockCreatedContract,
  id: 5,
  status: 'Funded',
  fundedAmount: 1000,
  releasedAmount: 300,
  milestones: [
    { index: 0, title: 'Design', amount: 300, released: true },
    { index: 1, title: 'Build', amount: 700, released: false },
  ],
};

const mockDisputedContract: EscrowContract = {
  ...mockCreatedContract,
  id: 6,
  status: 'Disputed',
  fundedAmount: 1000,
  releasedAmount: 300,
};

const mockCompletedContract: EscrowContract = {
  ...mockCreatedContract,
  id: 7,
  status: 'Completed',
  fundedAmount: 1000,
  releasedAmount: 1000,
  reputationIssued: false,
  milestones: [
    { index: 0, title: 'Design', amount: 300, released: true },
    { index: 1, title: 'Build', amount: 700, released: true },
  ],
};

describe('EscrowCard Accessibility (axe)', () => {
  it('has no axe violations for Created contract card', async () => {
    const { container } = render(<EscrowCard contract={mockCreatedContract} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations for Funded contract card', async () => {
    const { container } = render(<EscrowCard contract={mockFundedContract} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations for Disputed contract card', async () => {
    const { container } = render(<EscrowCard contract={mockDisputedContract} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations for Completed contract card', async () => {
    const { container } = render(<EscrowCard contract={mockCompletedContract} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('EscrowCard Semantics & Attributes', () => {
  it('renders semantic progressbar with accurate min, max, now and valuetext', () => {
    render(<EscrowCard contract={mockFundedContract} />);
    const progressbar = screen.getByRole('progressbar', { name: /escrow #5 progress/i });
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    expect(progressbar).toHaveAttribute('aria-valuenow', '30');
    expect(progressbar).toHaveAttribute('aria-valuetext', '300 of 1000 XLM released');
  });

  it('renders heading with h3 semantics and card id/title', () => {
    render(<EscrowCard contract={mockCreatedContract} />);
    const heading = screen.getByRole('heading', { level: 3, name: /#4 website redesign/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('id', 'escrow-heading-4');
  });

  it('replaces raw arrow entity with visually hidden client pays freelancer text', () => {
    const { container } = render(<EscrowCard contract={mockCreatedContract} />);
    expect(screen.getByText(/pays freelancer/i)).toHaveClass('sr-only');
    const arrow = container.querySelector('[aria-hidden="true"]');
    expect(arrow).toBeInTheDocument();
  });

  it('reflects aria-busy when busy prop is set', () => {
    const { rerender } = render(<EscrowCard contract={mockFundedContract} busy={false} />);
    const card = screen.getByRole('article');
    expect(card).toHaveAttribute('aria-busy', 'false');

    rerender(<EscrowCard contract={mockFundedContract} busy={true} />);
    expect(card).toHaveAttribute('aria-busy', 'true');
  });
});

describe('EscrowCard Accessible Names for Action Buttons', () => {
  it('asserts contextual accessible name and aria-describedby on cancel button', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<EscrowCard contract={mockCreatedContract} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel escrow #4/i });
    expect(cancelBtn).toBeInTheDocument();
    expect(cancelBtn).toHaveAttribute('aria-describedby', 'escrow-heading-4');

    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith(mockCreatedContract);
  });

  it('asserts contextual accessible name on dispute button', async () => {
    const onDispute = vi.fn();
    const user = userEvent.setup();
    render(<EscrowCard contract={mockCreatedContract} onDispute={onDispute} />);

    const disputeBtn = screen.getByRole('button', { name: /dispute escrow #4/i });
    expect(disputeBtn).toBeInTheDocument();
    expect(disputeBtn).toHaveAttribute('aria-describedby', 'escrow-heading-4');

    await user.click(disputeBtn);
    expect(onDispute).toHaveBeenCalledTimes(1);
    expect(onDispute).toHaveBeenCalledWith(mockCreatedContract, disputeBtn);
  });

  it('asserts contextual accessible name on fund button', async () => {
    const onFund = vi.fn();
    const user = userEvent.setup();
    render(<EscrowCard contract={mockCreatedContract} onFund={onFund} />);

    const fundBtn = screen.getByRole('button', { name: /fund 1000 xlm for escrow #4/i });
    expect(fundBtn).toBeInTheDocument();

    await user.click(fundBtn);
    expect(onFund).toHaveBeenCalledTimes(1);
    expect(onFund).toHaveBeenCalledWith(mockCreatedContract, 1000);
  });

  it('asserts contextual accessible name on release next button', async () => {
    const onReleaseNext = vi.fn();
    const user = userEvent.setup();
    render(<EscrowCard contract={mockFundedContract} onReleaseNext={onReleaseNext} />);

    const releaseBtn = screen.getByRole('button', { name: /release next milestone for escrow #5/i });
    expect(releaseBtn).toBeInTheDocument();

    await user.click(releaseBtn);
    expect(onReleaseNext).toHaveBeenCalledTimes(1);
    expect(onReleaseNext).toHaveBeenCalledWith(mockFundedContract, 1);
  });

  it('asserts contextual accessible name on resolve button', async () => {
    const onResolve = vi.fn();
    const user = userEvent.setup();
    render(<EscrowCard contract={mockDisputedContract} onResolve={onResolve} />);

    const resolveBtn = screen.getByRole('button', { name: /resolve 50\/50 for escrow #6/i });
    expect(resolveBtn).toBeInTheDocument();

    await user.click(resolveBtn);
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(mockDisputedContract);
  });

  it('asserts contextual accessible name on rating buttons', async () => {
    const onRate = vi.fn();
    const user = userEvent.setup();
    render(<EscrowCard contract={mockCompletedContract} onRate={onRate} />);

    const rate5Btn = screen.getByRole('button', { name: /rate freelancer 5 out of 5 stars for escrow #7/i });
    expect(rate5Btn).toBeInTheDocument();

    await user.click(rate5Btn);
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(mockCompletedContract, 5);
  });
});
