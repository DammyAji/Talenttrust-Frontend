import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { STAR_LABELS, StarRating, type StarRatingProps } from './StarRating';

const renderStars = (props: Partial<StarRatingProps> = {}) => {
  const onSubmit = props.onSubmit ?? vi.fn();
  const utils = render(<StarRating onSubmit={onSubmit} {...props} />);
  return { onSubmit, ...utils };
};

describe('StarRating', () => {
  it('renders a labelled radiogroup of five stars with meaningful names', () => {
    renderStars();
    const group = screen.getByRole('radiogroup', { name: 'Rate the freelancer' });
    expect(group).toBeInTheDocument();
    for (const label of STAR_LABELS) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('keeps submit disabled until a rating is chosen', async () => {
    const { onSubmit } = renderStars();
    const submit = screen.getByRole('button', { name: 'Submit rating' });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: '3 stars – Good' }));
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(3);
  });

  it('enters the group with a single Tab stop and moves selection with the arrow keys', async () => {
    renderStars();
    const user = userEvent.setup();

    // Roving tabindex: only the first radio is in the tab order.
    const tabbable = screen.getAllByRole('radio').filter((el) => el.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('aria-label', STAR_LABELS[0]);

    await user.tab();
    expect(screen.getByRole('radio', { name: '1 star – Poor' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '2 stars – Fair' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '2 stars – Fair' })).toHaveFocus();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('radio', { name: '4 stars – Very good' })).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '3 stars – Good' })).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: '5 stars – Excellent' })).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: '1 star – Poor' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not submit on Space or Enter, only selects', async () => {
    const { onSubmit } = renderStars();
    const user = userEvent.setup();

    await user.tab();
    await user.keyboard('{ArrowRight}');
    await user.keyboard(' ');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '2 stars – Fair' })).toHaveAttribute('aria-checked', 'true');
  });

  it('previews stars on hover and keeps the selection after leave', async () => {
    renderStars();
    const user = userEvent.setup();

    await user.hover(screen.getByRole('radio', { name: '4 stars – Very good' }));
    expect(screen.getByRole('radio', { name: '4 stars – Very good' })).toHaveClass('star-on');
    expect(screen.getByRole('radio', { name: '1 star – Poor' })).toHaveClass('star-on');

    await user.unhover(screen.getByRole('radio', { name: '4 stars – Very good' }));
    expect(screen.getByRole('radio', { name: '4 stars – Very good' })).not.toHaveClass('star-on');

    await user.click(screen.getByRole('radio', { name: '3 stars – Good' }));
    await user.hover(screen.getByRole('radio', { name: '5 stars – Excellent' }));
    await user.unhover(screen.getByRole('radio', { name: '5 stars – Excellent' }));
    expect(screen.getByRole('radio', { name: '3 stars – Good' })).toHaveClass('star-on');
  });

  it('shows an inline error when provided', () => {
    renderStars({ error: 'already_rated' });
    expect(screen.getByRole('alert')).toHaveTextContent('already_rated');
  });

  it('has no axe violations', async () => {
    const { container } = renderStars();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
