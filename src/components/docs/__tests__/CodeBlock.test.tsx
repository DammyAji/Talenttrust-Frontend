import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { DocHeading } from '@/components/docs/DocHeading';

describe('CodeBlock component', () => {
  const sampleCode = 'curl -X POST https://example.com/api';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders code content and copy button', () => {
    render(<CodeBlock title="Bash">{sampleCode}</CodeBlock>);
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText(sampleCode)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument();
  });

  it('copies code to clipboard on click and announces success politely', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<CodeBlock>{sampleCode}</CodeBlock>);
    const copyBtn = screen.getByRole('button', { name: /copy code/i });

    await user.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith(sampleCode);
    expect(screen.getByRole('button', { name: /copied code/i })).toBeInTheDocument();
    expect(screen.getByText('Code copied to clipboard')).toBeInTheDocument();
  });

  it('handles clipboard failure gracefully and announces error', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<CodeBlock>{sampleCode}</CodeBlock>);
    const copyBtn = screen.getByRole('button', { name: /copy code/i });

    await user.click(copyBtn);
    expect(screen.getByRole('button', { name: /failed to copy code/i })).toBeInTheDocument();
    expect(screen.getByText('Failed to copy code to clipboard')).toBeInTheDocument();
  });
});

describe('DocHeading component', () => {
  it('renders heading text and anchor link with accessible label', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<DocHeading id="overview" title="Overview" />);
    expect(screen.getByText('Overview')).toBeInTheDocument();

    const anchor = screen.getByRole('link', { name: 'Link to Overview' });
    expect(anchor).toHaveAttribute('href', '#overview');

    await user.click(anchor);
    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByText('Copied link to Overview')).toBeInTheDocument();
  });
});
