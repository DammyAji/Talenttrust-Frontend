/**
 * Header mobile navigation – accessibility and behaviour tests.
 *
 * Mocks:
 *  - next/navigation → usePathname returns a controllable value
 *  - next/link       → renders a plain <a> so focus/click work in jsdom
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsProvider } from '@/components/NotificationsProvider';

// ── Mock next/navigation ──────────────────────────────────────────────────────
const mockPathname = vi.fn(() => '/');
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// ── Mock next/link → plain <a> ────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    style,
    onClick,
    'aria-label': ariaLabel,
    'aria-current': ariaCurrent,
    ref,
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    ref?: React.Ref<HTMLAnchorElement>;
  }) => (
    <a
      href={href}
      className={className}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      ref={ref}
    >
      {children}
    </a>
  ),
}));

// ── matchMedia stub (jsdom doesn't have it) ───────────────────────────────────
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

// Import after mocks are set up
import { Header } from '../Header';

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Always finds the trigger regardless of its current label (Menu/Close) */
const getTrigger = () =>
  screen.getByRole('button', { name: /menu|close/i });
const getPanel = () => document.getElementById('mobile-nav') as HTMLElement;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Header – mobile menu trigger', () => {
  it('renders the trigger button with aria-expanded="false" when closed', () => {
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    expect(getTrigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('sets aria-expanded="true" after toggle and shows the panel', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    const trigger = getTrigger(); // capture before click (labelled "Menu")
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(getPanel()).toHaveClass('mobile-nav--open');
  });

  it('aria-controls points to the panel id', () => {
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    expect(getTrigger()).toHaveAttribute('aria-controls', 'mobile-nav');
  });

  it('label changes to "Close" when open', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    await user.click(getTrigger());
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });
});

describe('Header – Escape key', () => {
  it('closes the panel on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    const trigger = getTrigger();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Header – outside click (pointer-down)', () => {
  it('closes the panel when clicking outside the panel and trigger', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    const trigger = getTrigger();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // jsdom doesn't ship PointerEvent; dispatching a plain Event named
    // 'pointerdown' on body is enough — the hook checks containment and
    // body is outside both the panel and the trigger.
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });

    expect(getTrigger()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Header – route change', () => {
  it('closes the panel when pathname changes', async () => {
    const user = userEvent.setup();
    mockPathname.mockReturnValue('/');
    const { rerender } = render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    await user.click(getTrigger());
    expect(getTrigger()).toHaveAttribute('aria-expanded', 'true');

    // Simulate route change
    mockPathname.mockReturnValue('/contracts');
    rerender(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    expect(getTrigger()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Header – focus leaving the panel', () => {
  it('closes the panel when focus moves outside the panel', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    await user.click(getTrigger());
    const panel = getPanel();
    expect(panel).toHaveClass('mobile-nav--open');

    // Fire focusout with relatedTarget outside the panel
    const outsideEl = document.createElement('button');
    document.body.appendChild(outsideEl);
    await act(async () => {
      panel.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideEl }),
      );
    });

    expect(getTrigger()).toHaveAttribute('aria-expanded', 'false');
    outsideEl.remove();
  });
});

describe('Header – CTA present in mobile panel', () => {
  it('renders the Launch app link inside the mobile nav', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    await user.click(getTrigger());

    const panel = getPanel();
    const cta = within(panel).getByRole('link', { name: /launch app/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/contracts');
  });
});

describe('Header – aria-current preserved in mobile panel', () => {
  it('marks the active route with aria-current="page" inside mobile nav', async () => {
    mockPathname.mockReturnValue('/docs');
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    await user.click(getTrigger());

    const panel = getPanel();
    const docsLink = within(panel).getByRole('link', { name: /docs/i });
    expect(docsLink).toHaveAttribute('aria-current', 'page');
  });
});

describe('Header – body scroll lock', () => {
  it('locks body scroll when panel is open and restores on close', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    await user.click(getTrigger());
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Header – desktop nav', () => {
  it('always renders the desktop nav with all links and the CTA', () => {
    render(
      <NotificationsProvider>
        <Header />
      </NotificationsProvider>,
    );
    const mainNav = screen.getByRole('navigation', { name: /main/i });
    expect(within(mainNav).getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(within(mainNav).getByRole('link', { name: /launch app/i })).toBeInTheDocument();
  });
});
