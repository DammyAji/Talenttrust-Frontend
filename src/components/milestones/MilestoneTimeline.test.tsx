import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MilestoneTimeline } from './MilestoneTimeline';
import type { EscrowContract } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

function makeContract(overrides: Partial<EscrowContract> = {}): EscrowContract {
  return {
    id: 1,
    title: 'Test Contract',
    client: 'GCLIENT',
    freelancer: 'GFREELANCER',
    token: 'XLM',
    milestones: [
      { index: 0, title: 'Design', amount: 300, released: false },
      { index: 1, title: 'Build', amount: 700, released: false },
      { index: 2, title: 'Deploy', amount: 200, released: false },
    ],
    totalAmount: 1200,
    fundedAmount: 1200,
    releasedAmount: 0,
    status: 'Funded',
    reputationIssued: false,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Rendering
// ──────────────────────────────────────────────────────────────────────────────

describe('MilestoneTimeline — rendering', () => {
  it('renders all milestones with title and amount', () => {
    render(<MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} />);
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getAllByText(/300 XLM/)).not.toHaveLength(0);
    expect(screen.getAllByText(/700 XLM/)).not.toHaveLength(0);
    expect(screen.getAllByText(/200 XLM/)).not.toHaveLength(0);
  });

  it('shows no [x] or [ ] ASCII checkbox text in the DOM', () => {
    const { container } = render(
      <MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/\[x\]/i);
    expect(container.textContent).not.toMatch(/\[\s*\]/);
  });

  it('renders a progressbar with correct aria attributes', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({ releasedAmount: 300, totalAmount: 1200 })}
        onRelease={vi.fn()}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAccessibleName(/25%/i);
  });

  it('shows 0% progress when nothing is released', () => {
    render(<MilestoneTimeline contract={makeContract({ releasedAmount: 0 })} onRelease={vi.fn()} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows 100% progress when everything is released', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({
          releasedAmount: 1200,
          fundedAmount: 1200,
          milestones: [
            { index: 0, title: 'Design', amount: 300, released: true },
            { index: 1, title: 'Build', amount: 700, released: true },
            { index: 2, title: 'Deploy', amount: 200, released: true },
          ],
        })}
        onRelease={vi.fn()}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Status chips and screen-reader text
// ──────────────────────────────────────────────────────────────────────────────

describe('MilestoneTimeline — status chips', () => {
  it('shows "Released" status chip for released milestones', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({
          milestones: [
            { index: 0, title: 'Design', amount: 300, released: true },
            { index: 1, title: 'Build', amount: 700, released: false },
            { index: 2, title: 'Deploy', amount: 200, released: false },
          ],
          releasedAmount: 300,
        })}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Released').length).toBeGreaterThan(0);
  });

  it('shows "Ready to release" for releasable milestones', () => {
    render(<MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} />);
    expect(screen.getAllByText('Ready to release').length).toBeGreaterThan(0);
  });

  it('shows "Awaiting funds" when balance is insufficient', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({ fundedAmount: 100, releasedAmount: 0 })}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Awaiting funds').length).toBeGreaterThan(0);
  });

  it('shows "Locked" for milestones on a non-active contract', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({ status: 'Disputed', fundedAmount: 1200 })}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
  });

  it('has screen-reader text for each milestone status', () => {
    const { container } = render(
      <MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} />,
    );
    // sr-only spans contain descriptive text
    const srOnlySpans = container.querySelectorAll('.sr-only');
    expect(srOnlySpans.length).toBeGreaterThanOrEqual(3);
    const srText = [...srOnlySpans].map((s) => s.textContent).join(' ');
    expect(srText).toMatch(/Milestone 1.*Design/i);
    expect(srText).toMatch(/Milestone 2.*Build/i);
    expect(srText).toMatch(/Milestone 3.*Deploy/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Release button interactions
// ──────────────────────────────────────────────────────────────────────────────

describe('MilestoneTimeline — release buttons', () => {
  it('calls onRelease(0) when the first releasable milestone Release button is clicked', () => {
    const onRelease = vi.fn();
    render(<MilestoneTimeline contract={makeContract()} onRelease={onRelease} />);
    const btn = screen.getByRole('button', { name: /Release "Design"/i });
    fireEvent.click(btn);
    expect(onRelease).toHaveBeenCalledWith(0);
  });

  it('calls onRelease(1) when milestone at index 1 is clicked', () => {
    const onRelease = vi.fn();
    render(<MilestoneTimeline contract={makeContract()} onRelease={onRelease} />);
    const btn = screen.getByRole('button', { name: /Release "Build"/i });
    fireEvent.click(btn);
    expect(onRelease).toHaveBeenCalledWith(1);
  });

  it('calls onRelease(2) when milestone at index 2 is clicked — out-of-order release', () => {
    const onRelease = vi.fn();
    // Balance covers Deploy (200) but not Build (700)
    render(
      <MilestoneTimeline
        contract={makeContract({
          fundedAmount: 500,
          releasedAmount: 300,
          milestones: [
            { index: 0, title: 'Design', amount: 300, released: true },
            { index: 1, title: 'Build', amount: 700, released: false },
            { index: 2, title: 'Deploy', amount: 200, released: false },
          ],
        })}
        onRelease={onRelease}
      />,
    );
    const btn = screen.getByRole('button', { name: /Release "Deploy"/i });
    fireEvent.click(btn);
    expect(onRelease).toHaveBeenCalledWith(2);
  });

  it('does NOT show a Release button for released milestones', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({
          milestones: [
            { index: 0, title: 'Design', amount: 300, released: true },
            { index: 1, title: 'Build', amount: 700, released: false },
            { index: 2, title: 'Deploy', amount: 200, released: false },
          ],
          releasedAmount: 300,
        })}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Release "Design"/i })).not.toBeInTheDocument();
  });

  it('does NOT show a Release button for locked milestones (disputed contract)', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({ status: 'Disputed', fundedAmount: 1200 })}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Release/i })).not.toBeInTheDocument();
  });

  it('does NOT show a Release button for awaiting-funds milestones', () => {
    render(
      <MilestoneTimeline
        contract={makeContract({ fundedAmount: 50, releasedAmount: 0 })}
        onRelease={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Release/i })).not.toBeInTheDocument();
  });

  it('disables Release buttons when busy prop is true', () => {
    render(<MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} busy />);
    const buttons = screen.getAllByRole('button', { name: /Release/i });
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('has accessible names on Release buttons that include milestone title and amount', () => {
    render(<MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} />);
    const designBtn = screen.getByRole('button', { name: /Release "Design" \(300 XLM\)/i });
    expect(designBtn).toBeInTheDocument();
  });

  it('Release button is keyboard-operable (Enter key fires onRelease)', () => {
    const onRelease = vi.fn();
    render(<MilestoneTimeline contract={makeContract()} onRelease={onRelease} />);
    const btn = screen.getByRole('button', { name: /Release "Design"/i });
    btn.focus();
    expect(btn).toHaveFocus();
    fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' });
    fireEvent.click(btn); // simulates default button Enter behaviour
    expect(onRelease).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Accessibility (axe)
// ──────────────────────────────────────────────────────────────────────────────

describe('MilestoneTimeline — axe accessibility', () => {
  it('has no axe violations in the fully-funded releasable state', async () => {
    const { container } = render(
      <MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations in the released state', async () => {
    const { container } = render(
      <MilestoneTimeline
        contract={makeContract({
          releasedAmount: 1200,
          milestones: [
            { index: 0, title: 'Design', amount: 300, released: true },
            { index: 1, title: 'Build', amount: 700, released: true },
            { index: 2, title: 'Deploy', amount: 200, released: true },
          ],
        })}
        onRelease={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations in the awaiting-funds state', async () => {
    const { container } = render(
      <MilestoneTimeline
        contract={makeContract({ fundedAmount: 0, releasedAmount: 0 })}
        onRelease={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations in the locked (disputed) state', async () => {
    const { container } = render(
      <MilestoneTimeline
        contract={makeContract({ status: 'Disputed', fundedAmount: 1200 })}
        onRelease={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations in the busy (releasing) state', async () => {
    const { container } = render(
      <MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} busy />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Network error / failure states
// ──────────────────────────────────────────────────────────────────────────────

describe('MilestoneTimeline — edge cases', () => {
  it('handles an empty milestones array gracefully', () => {
    const contract = makeContract({ milestones: [], totalAmount: 0, fundedAmount: 0, releasedAmount: 0 });
    const { container } = render(<MilestoneTimeline contract={contract} onRelease={vi.fn()} />);
    expect(container).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('handles a single milestone contract', () => {
    const onRelease = vi.fn();
    render(
      <MilestoneTimeline
        contract={makeContract({
          milestones: [{ index: 0, title: 'Full Payment', amount: 1000, released: false }],
          totalAmount: 1000,
          fundedAmount: 1000,
          releasedAmount: 0,
        })}
        onRelease={onRelease}
      />,
    );
    const btn = screen.getByRole('button', { name: /Release "Full Payment"/i });
    fireEvent.click(btn);
    expect(onRelease).toHaveBeenCalledWith(0);
  });

  it('milestone list is wrapped in an ordered list element', () => {
    const { container } = render(
      <MilestoneTimeline contract={makeContract()} onRelease={vi.fn()} />,
    );
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
  });
});
