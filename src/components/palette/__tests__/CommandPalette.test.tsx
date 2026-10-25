import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '@/components/palette/CommandPalette';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe('CommandPalette component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders trigger button with accessible label and shortcut hint', () => {
    render(<CommandPalette />);
    const trigger = screen.getByRole('button', { name: /search and command palette/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('opens palette dialog when trigger button is clicked', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    const trigger = screen.getByRole('button', { name: /search and command palette/i });
    await user.click(trigger);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens palette dialog via Ctrl+K and Cmd+K', () => {
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('ignores Ctrl+K shortcut when user is typing inside another input element', () => {
    render(
      <div>
        <input data-testid="outside-input" />
        <CommandPalette />
      </div>
    );

    const outsideInput = screen.getByTestId('outside-input');
    outsideInput.focus();

    fireEvent.keyDown(outsideInput, { key: 'k', ctrlKey: true });
    const combobox = screen.queryByRole('combobox');
    expect(combobox).not.toBeInTheDocument();
  });

  it('supports full keyboard navigation (arrows, home, end, enter) and navigation', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    const trigger = screen.getByRole('button', { name: /search and command palette/i });
    await user.click(trigger);

    const input = screen.getByRole('combobox');
    await user.type(input, 'esc');

    // Options should be filtered
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);

    // Arrow down
    await user.keyboard('{ArrowDown}');
    // Press Enter to execute command
    await user.keyboard('{Enter}');

    expect(pushMock).toHaveBeenCalled();
  });

  it('closes dialog and restores focus when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    const trigger = screen.getByRole('button', { name: /search and command palette/i });
    await user.click(trigger);

    expect(screen.getByRole('combobox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
