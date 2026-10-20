/**
 * EscrowDashboard — optimistic updates component tests
 *
 * Tests cover:
 * - Success path: release/deposit resolves, API called, reload triggered
 * - Rollback path: rejected API shows card-local error with Retry button
 * - Server-wins: server response that differs from the optimistic guess wins
 * - No double-submit while an optimistic action for that card is in flight
 * - Blocking actions (Cancel, Dispute, Resolve) are NOT optimistic
 * - Keyboard operability of Retry button
 * - Live-region announcement on action start
 * - Failure states: initial load failure, empty state, non-2xx errors
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import type { EscrowContract } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Mock the api module
// ─────────────────────────────────────────────────────────────────────────────

const mockApi = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

// Dynamic import AFTER vi.mock so the module gets the hoisted mock
const { EscrowDashboard } = await import('@/components/EscrowDashboard');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeContract(overrides: Partial<EscrowContract> = {}): EscrowContract {
  return {
    id: 1,
    title: 'Test contract',
    client: 'GCLIENTXXXXXX',
    freelancer: 'GFREELANCERYYYY',
    token: 'XLM',
    milestones: [
      { index: 0, title: 'Design', amount: 300, released: false },
      { index: 1, title: 'Build', amount: 700, released: false },
    ],
    totalAmount: 1000,
    fundedAmount: 1000,
    releasedAmount: 0,
    status: 'Funded',
    reputationIssued: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
// Rendering basics
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — rendering', () => {
  it('shows Release next button for a funded contract', async () => {
    mockApi.mockResolvedValue({ data: [makeContract()] });
    render(<EscrowDashboard />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Release "Design"/i })).toBeInTheDocument(),
    );
  });

  it('shows Fund button when contract is underfunded', async () => {
    mockApi.mockResolvedValue({
      data: [makeContract({ status: 'Created', fundedAmount: 0 })],
    });
    render(<EscrowDashboard />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Fund/i })).toBeInTheDocument(),
    );
  });

  it('no [x] or [ ] ASCII checkbox text in the DOM', async () => {
    mockApi.mockResolvedValue({ data: [makeContract()] });
    render(<EscrowDashboard />);
    await waitFor(() => screen.getByText(/Test contract/i));
    expect(document.body.textContent).not.toMatch(/\[x\]/);
    expect(document.body.textContent).not.toMatch(/\[\s*\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Optimistic release — success path
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — optimistic release (success)', () => {
  it('calls the release API and then reloads contracts', async () => {
    let releaseCallCount = 0;
    let loadCallCount = 0;

    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') {
        loadCallCount++;
        return Promise.resolve({ data: [makeContract()] });
      }
      if (String(path).includes('/release')) {
        releaseCallCount++;
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Unexpected API call: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));
    });

    await waitFor(() => {
      expect(releaseCallCount).toBe(1);
      expect(loadCallCount).toBeGreaterThanOrEqual(2); // initial + post-release reload
    });
  });

  it('server response that differs from optimistic guess wins', async () => {
    const serverWins = makeContract({
      milestones: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: true },
      ],
      releasedAmount: 1000,
      status: 'Completed',
    });

    let loadCallCount = 0;

    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') {
        loadCallCount++;
        return Promise.resolve({
          data: [loadCallCount === 1 ? makeContract() : serverWins],
        });
      }
      if (String(path).includes('/release')) return Promise.resolve({});
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));
    });

    // After reload, server's Completed status wins
    await waitFor(() => expect(screen.getByText('Completed')).toBeInTheDocument());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rollback on failure
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — rollback on failure', () => {
  it('rejected release shows card-local error with Retry button', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release')) return Promise.reject(new Error('Network error'));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/Network error/i);
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('Retry button re-dispatches the failed action', async () => {
    let releaseCallCount = 0;

    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release')) {
        releaseCallCount++;
        if (releaseCallCount === 1) return Promise.reject(new Error('Timeout'));
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));
    });

    await waitFor(() => screen.getByRole('button', { name: /Retry/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    });

    await waitFor(() => expect(releaseCallCount).toBe(2));
  });

  it('rejected deposit shows card-local error', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts')
        return Promise.resolve({ data: [makeContract({ status: 'Created', fundedAmount: 0 })] });
      if (String(path).includes('/deposit'))
        return Promise.reject(new Error('Insufficient balance'));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Fund/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fund/i }));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/Insufficient balance/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No double-submit
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — no double-submit', () => {
  it('Release button is disabled while an optimistic action is in flight', async () => {
    let resolveRelease!: () => void;
    const pending = new Promise<unknown>((res) => {
      resolveRelease = () => res({});
    });

    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release')) return pending;
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    // Click — action goes in-flight
    fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));

    // The button should now be disabled (showing Releasing… or disabled state)
    await waitFor(() => {
      const allBtns = screen.queryAllByRole('button', { name: /Release|Releasing/i });
      allBtns.forEach((btn) => expect(btn).toBeDisabled());
    });

    // Clean up pending promise
    resolveRelease();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blocking actions — not optimistic
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — blocking actions', () => {
  it('Dispute button calls the dispute API', async () => {
    let disputeCalled = false;
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/dispute')) {
        disputeCalled = true;
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Dispute/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Dispute/i }));
    });

    await waitFor(() => expect(disputeCalled).toBe(true));
  });

  it('Cancel button calls the cancel API', async () => {
    let cancelCalled = false;
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/cancel')) {
        cancelCalled = true;
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Cancel/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    });

    await waitFor(() => expect(cancelCalled).toBe(true));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live region
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — live region', () => {
  it('live region is present with aria-live="polite" and aria-atomic', () => {
    mockApi.mockResolvedValue({ data: [] });
    render(<EscrowDashboard />);
    const region = screen.getByTestId('live-region');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('live region gets filled when a release action is dispatched', async () => {
    let resolveRelease!: () => void;
    const pending = new Promise<unknown>((res) => {
      resolveRelease = () => res({});
    });

    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release')) return pending;
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));

    await waitFor(() => {
      const region = screen.getByTestId('live-region');
      expect(region.textContent).toMatch(/Releasing/i);
    });

    resolveRelease();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — accessibility', () => {
  it('Retry button has an accessible name', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release')) return Promise.reject(new Error('fail'));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));
    });

    await waitFor(() => screen.getByRole('button', { name: /Retry failed action/i }));
    expect(screen.getByRole('button', { name: /Retry failed action/i })).toHaveAccessibleName();
  });

  it('Retry button is keyboard-operable (can receive focus)', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release')) return Promise.reject(new Error('fail'));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));
    });

    await waitFor(() => screen.getByRole('button', { name: /Retry/i }));
    const retry = screen.getByRole('button', { name: /Retry/i });
    retry.focus();
    expect(retry).toHaveFocus();
  });

  it('optimistic card gets aria-busy="true" while action is in flight', async () => {
    let resolveRelease!: () => void;
    const pending = new Promise<unknown>((res) => {
      resolveRelease = () => res({});
    });

    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release')) return pending;
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));

    await waitFor(() => {
      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('aria-busy', 'true');
    });

    resolveRelease();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failure states
// ─────────────────────────────────────────────────────────────────────────────

describe('EscrowDashboard — failure states', () => {
  it('shows global error when initial load fails', async () => {
    mockApi.mockRejectedValue(new Error('Server down'));
    render(<EscrowDashboard />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/Could not reach the API/i);
  });

  it('shows empty state when no contracts exist', async () => {
    mockApi.mockResolvedValue({ data: [] });
    render(<EscrowDashboard />);
    await waitFor(() =>
      expect(screen.getByText(/No escrows yet/i)).toBeInTheDocument(),
    );
  });

  it('non-2xx error surfaced in card-local alert', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/contracts') return Promise.resolve({ data: [makeContract()] });
      if (String(path).includes('/release'))
        return Promise.reject(new Error('Request failed (403)'));
      return Promise.reject(new Error(`Unexpected: ${path}`));
    });

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('button', { name: /Release "Design"/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Release "Design"/i }));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/403/);
  });

  it('empty milestones contract renders without crashing', async () => {
    mockApi.mockResolvedValue({
      data: [makeContract({ milestones: [], totalAmount: 0 })],
    });
    render(<EscrowDashboard />);
    await waitFor(() => screen.getByText(/Test contract/i));
    expect(screen.queryByRole('button', { name: /Release/i })).not.toBeInTheDocument();
  });
});
