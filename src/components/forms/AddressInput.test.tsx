import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddressInput, type AddressInputHandle } from './AddressInput';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

function Harness({ walletAddress }: { walletAddress?: string }) {
  const ref = useRef<AddressInputHandle>(null);
  const [value, setValue] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!ref.current?.validate()) ref.current?.focus();
      }}
    >
      <AddressInput
        ref={ref}
        label="Client address"
        description="A Stellar account address."
        value={value}
        onChange={setValue}
        walletAddress={walletAddress}
      />
      <button type="submit">Submit</button>
    </form>
  );
}

describe('AddressInput', () => {
  it('links the error through aria-describedby and sets aria-invalid on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Client address');

    await user.type(input, 'not-an-address');
    await user.tab();

    expect(input).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('56 characters');
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining(error.id));
  });

  it('normalises pasted input and clears the error', async () => {
    const user = userEvent.setup();
    const readText = vi.fn().mockResolvedValue(` ${ACCOUNT.toLowerCase()} `);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Paste' }));

    await waitFor(() => expect(screen.getByLabelText('Client address')).toHaveValue(ACCOUNT));
    expect(readText).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports clipboard failures without breaking the form', async () => {
    const user = userEvent.setup();
    const readText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Paste' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the clipboard');
  });

  it('fills the field from a connected wallet', async () => {
    const user = userEvent.setup();
    render(<Harness walletAddress={ACCOUNT.toLowerCase()} />);

    await user.click(screen.getByRole('button', { name: 'Use my wallet' }));

    expect(screen.getByLabelText('Client address')).toHaveValue(ACCOUNT);
  });

  it('focuses and reports an invalid value on submit', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByLabelText('Client address')).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Stellar address');
  });
});
