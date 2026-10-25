import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocsToc } from '@/components/docs/DocsToc';

const items: Array<[string, string]> = [
  ['overview', 'Overview'],
  ['architecture', 'Architecture'],
  ['lifecycle', 'Escrow lifecycle'],
  ['how-to', 'How to use'],
  ['api', 'API'],
];

describe('DocsToc component', () => {
  let observerCallback: (entries: IntersectionObserverEntry[]) => void;
  const mockDisconnect = vi.fn();
  const mockObserve = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';

    // Mock IntersectionObserver
    // A regular function so the mock can be called with `new`.
    window.IntersectionObserver = vi.fn().mockImplementation(function (callback: (entries: IntersectionObserverEntry[]) => void) {
      observerCallback = callback;
      return {
        observe: mockObserve,
        disconnect: mockDisconnect,
        unobserve: vi.fn(),
      };
    });
  });

  it('renders all table of contents items in desktop and mobile view', () => {
    render(<DocsToc items={items} />);
    const desktopOverview = screen.getAllByRole('link', { name: 'Overview' });
    expect(desktopOverview.length).toBeGreaterThan(0);
  });

  it('highlights the active entry based on URL hash on load', () => {
    window.location.hash = '#api';
    render(<DocsToc items={items} />);
    const apiLinks = screen.getAllByRole('link', { name: 'API' });
    expect(apiLinks.some((l) => l.getAttribute('aria-current') === 'location')).toBe(true);
  });

  it('updates the active section when IntersectionObserver reports visibility', () => {
    render(<DocsToc items={items} />);

    // Simulate architecture section coming into view
    act(() => {
      observerCallback([
        {
          target: { id: 'architecture' } as HTMLElement,
          isIntersecting: true,
          boundingClientRect: { top: 100 } as DOMRectReadOnly,
        } as unknown as IntersectionObserverEntry,
      ]);
    });

    const archLinks = screen.getAllByRole('link', { name: 'Architecture' });
    expect(archLinks.some((l) => l.getAttribute('aria-current') === 'location')).toBe(true);
  });

  it('toggles mobile disclosure when disclosure button is clicked and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<DocsToc items={items} />);

    const disclosureBtn = screen.getByRole('button', { name: /on this page:/i });
    expect(disclosureBtn).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    await user.click(disclosureBtn);
    expect(disclosureBtn).toHaveAttribute('aria-expanded', 'true');

    const mobileList = document.getElementById('toc-mobile-list');
    expect(mobileList).toBeInTheDocument();

    // Press Escape to close
    await user.keyboard('{Escape}');
    expect(disclosureBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes mobile disclosure and smooth scrolls when an item is clicked', async () => {
    const user = userEvent.setup();
    const scrollIntoViewMock = vi.fn();
    const targetElement = document.createElement('div');
    targetElement.id = 'how-to';
    targetElement.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(targetElement);

    render(<DocsToc items={items} />);

    const disclosureBtn = screen.getByRole('button', { name: /on this page:/i });
    await user.click(disclosureBtn);

    const howToMobileLink = screen.getAllByRole('link', { name: 'How to use' })[1];
    await user.click(howToMobileLink);

    expect(disclosureBtn).toHaveAttribute('aria-expanded', 'false');
    expect(scrollIntoViewMock).toHaveBeenCalled();

    document.body.removeChild(targetElement);
  });
});
