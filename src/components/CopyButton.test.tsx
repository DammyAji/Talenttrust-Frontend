import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './toast/ToastProvider';
import { CopyButton } from './CopyButton';

const stubClipboard = (value: unknown) => {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
};

const renderCopy = (value = 'CCZMIVUBMG5S') =>
  render(
    <ToastProvider>
      <CopyButton value={value} />
    </ToastProvider>,
  );

describe('CopyButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('confirms a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    renderCopy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('CCZMIVUBMG5S');
  });

  it('shows an error toast when the clipboard write fails', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('Write permission denied')) });

    renderCopy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText('Could not copy to the clipboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('shows an error toast when the clipboard API is unavailable', async () => {
    stubClipboard(undefined);

    renderCopy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByText('Could not copy to the clipboard')).toBeInTheDocument();
  });
});
