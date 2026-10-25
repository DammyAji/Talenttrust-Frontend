import { describe, it, expect, vi } from 'vitest';
import { Component, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import ContractsError from '@/app/contracts/error';
import { Header } from '@/components/Header';

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  // Header renders the command palette, which navigates with the router.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom does not implement window.matchMedia; Header uses it in a useEffect.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: () =>
    ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
});

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <ContractsError error={this.state.error} reset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function Boom(): ReactNode {
  throw new Error('render exploded');
}

describe('contracts error boundary', () => {
  it('renders the boundary instead of crashing and keeps the header visible', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <>
        <Header />
        <main id="main">
          <Boundary>
            <Boom />
          </Boundary>
        </main>
      </>,
    );
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /talenttrust home/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
