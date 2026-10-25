import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm } from '@/components/ui/ConfirmProvider';

interface HarnessProps {
  tone?: 'danger' | 'default';
  requireText?: string;
  onResult?: (result: boolean) => void;
}

function Harness({ tone = 'danger', requireText, onResult }: HarnessProps) {
  const confirm = useConfirm();
  const [result, setResult] = useState<'true' | 'false' | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: 'Delete project?',
            description: 'This cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Back',
            tone,
            requireText,
          });
          setResult(ok ? 'true' : 'false');
          onResult?.(ok);
        }}
      >
        Open
      </button>
      <output data-testid="result">{result}</output>
    </div>
  );
}

function renderHarness(props: HarnessProps = {}) {
  return render(
    <ConfirmProvider>
      <Harness {...props} />
    </ConfirmProvider>,
  );
}

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return screen.findByRole('dialog');
};

describe('ConfirmDialog via useConfirm', () => {
  it('resolves true when the confirm button is activated', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderHarness({ onResult });

    await openDialog(user);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.getByTestId('result')).toHaveTextContent('true');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('resolves false on Escape', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderHarness({ onResult });

    await openDialog(user);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.getByTestId('result')).toHaveTextContent('false');
  });

  it('resolves false on backdrop click', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderHarness({ onResult });

    const dialog = await openDialog(user);
    fireEvent.click(dialog);

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.getByTestId('result')).toHaveTextContent('false');
  });

  it('resolves false on the Back (safe) button', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderHarness({ onResult });

    await openDialog(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.getByTestId('result')).toHaveTextContent('false');
  });

  it('keeps confirm disabled until the required text matches exactly', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderHarness({ requireText: '42', onResult });

    await openDialog(user);
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    const input = screen.getByLabelText(/type 42 to confirm/i);

    expect(confirmButton).toBeDisabled();

    await user.type(input, '4');
    expect(confirmButton).toBeDisabled();

    await user.type(input, '3');
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, '42');
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('focuses the safe button first for danger tone and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderHarness({ tone: 'danger' });

    const trigger = screen.getByRole('button', { name: 'Open' });
    await openDialog(user);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('is fully operable by keyboard (Tab + Enter)', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderHarness({ onResult });

    await openDialog(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus());

    await user.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('exposes aria-labelledby and aria-describedby that resolve to the title and description', async () => {
    const user = userEvent.setup();
    renderHarness();

    const dialog = await openDialog(user);

    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(dialog).toHaveAccessibleName('Delete project?');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
  });

  it('locks background scroll while open and restores it afterwards', async () => {
    const user = userEvent.setup();
    renderHarness();

    const previous = document.body.style.overflow;
    await openDialog(user);
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).toBe(previous));
  });
});
