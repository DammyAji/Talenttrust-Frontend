import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '@/components/ui/Skeleton';

describe('Skeleton', () => {
  it('is aria-hidden so it is ignored by assistive tech', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders a line variant by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton-line')).toBeInTheDocument();
  });

  it('renders a block variant with custom dimensions', () => {
    const { container } = render(<Skeleton variant="block" width={120} height={40} radius={8} />);
    const el = container.querySelector('.skeleton-block') as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('40px');
    expect(el.style.borderRadius).toBe('8px');
  });
});
