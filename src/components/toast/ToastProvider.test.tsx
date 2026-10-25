import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ERROR_TOAST_DURATION_MS,
  MAX_VISIBLE_TOASTS,
  TOAST_DURATION_MS,
  ToastProvider,
  useToast,
} from './ToastProvider';

const TICK_MS = 100;
const actionSpy = vi.fn();

function Probe() {
  const { success, error, info, dismiss } = useToast();
  return (
    <div>
      <button type="button" onClick={() => success('Escrow #1 funded')}>
        fund
      </button>
      <button type="button" onClick={() => success('Escrow #2 funded')}>
        fund another
      </button>
      <button type="button" onClick={() => success('Escrow #3 funded')}>
        fund third
      </button>
      <button type="button" onClick={() => success('Escrow #4 funded')}>
        fund fourth
      </button>
      <button type="button" onClick={() => error('Release failed (409)')}>
        fail
      </button>
      <button type="button" onClick={() => info('Checking for updates')}>
        info
      </button>
      <button
        type="button"
        onClick={() => success('Escrow #7 created', { action: { label: 'View escrow', onClick: actionSpy } })}
      >
        create
      </button>
      <button type="button" onClick={() => dismiss()}>
        clear
      </button>
    </div>
  );
}

const renderToasts = () =>
  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );

const politeRegion = () => screen.getByRole('status');
const alertRegion = () => screen.getByRole('alert');

describe('ToastProvider', () => {
  beforeEach(() => {
    actionSpy.mockClear();
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders success/info toasts in the polite region and errors in the alert region', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    fireEvent.click(screen.getByRole('button', { name: 'fail' }));
    fireEvent.click(screen.getByRole('button', { name: 'info' }));

    expect(within(politeRegion()).getByText('Escrow #1 funded')).toBeInTheDocument();
    expect(within(politeRegion()).getByText('Checking for updates')).toBeInTheDocument();
    expect(within(alertRegion()).getByText('Release failed (409)')).toBeInTheDocument();
    expect(within(alertRegion()).queryByText('Escrow #1 funded')).not.toBeInTheDocument();
    expect(within(politeRegion()).queryByText('Release failed (409)')).not.toBeInTheDocument();
  });

  it('auto-dismisses success toasts after 5s and errors after 8s', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    fireEvent.click(screen.getByRole('button', { name: 'fail' }));

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(within(politeRegion()).getByText('Escrow #1 funded')).toBeInTheDocument();
    expect(within(alertRegion()).getByText('Release failed (409)')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(within(politeRegion()).queryByText('Escrow #1 funded')).not.toBeInTheDocument();
    expect(within(alertRegion()).getByText('Release failed (409)')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(ERROR_TOAST_DURATION_MS - TOAST_DURATION_MS));
    expect(within(alertRegion()).queryByText('Release failed (409)')).not.toBeInTheDocument();
  });

  it('pauses the auto-dismiss timer while hovered and resumes on leave', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    const toast = within(politeRegion()).getByText('Escrow #1 funded').closest('.toast') as HTMLElement;

    // React synthesises mouseenter/mouseleave from mouseover/mouseout.
    fireEvent.mouseOver(toast);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 2));
    expect(within(politeRegion()).getByText('Escrow #1 funded')).toBeInTheDocument();

    fireEvent.mouseOut(toast);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - TICK_MS));
    expect(within(politeRegion()).getByText('Escrow #1 funded')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TICK_MS));
    expect(within(politeRegion()).queryByText('Escrow #1 funded')).not.toBeInTheDocument();
  });

  it('pauses the auto-dismiss timer while a toast has focus and resumes on blur', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    const closeButton = screen.getByRole('button', { name: 'Dismiss notification' });

    closeButton.focus();
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 2));
    expect(within(politeRegion()).getByText('Escrow #1 funded')).toBeInTheDocument();

    closeButton.blur();
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(within(politeRegion()).queryByText('Escrow #1 funded')).not.toBeInTheDocument();
  });

  it(`keeps at most ${MAX_VISIBLE_TOASTS} toasts, dropping the oldest`, () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    fireEvent.click(screen.getByRole('button', { name: 'fund another' }));
    fireEvent.click(screen.getByRole('button', { name: 'fund third' }));
    fireEvent.click(screen.getByRole('button', { name: 'fund fourth' }));

    expect(within(politeRegion()).queryByText('Escrow #1 funded')).not.toBeInTheDocument();
    expect(within(politeRegion()).getByText('Escrow #2 funded')).toBeInTheDocument();
    expect(within(politeRegion()).getByText('Escrow #3 funded')).toBeInTheDocument();
    expect(within(politeRegion()).getByText('Escrow #4 funded')).toBeInTheDocument();
  });

  it('dedupes identical consecutive messages instead of stacking them', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));

    expect(politeRegion().querySelectorAll('.toast')).toHaveLength(1);
  });

  it('runs the optional action callback and dismisses the toast', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    expect(within(politeRegion()).getByText('Escrow #7 created')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View escrow' }));

    expect(actionSpy).toHaveBeenCalledTimes(1);
    expect(within(politeRegion()).queryByText('Escrow #7 created')).not.toBeInTheDocument();
  });

  it('dismisses a toast from its close button', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));

    const closeButton = screen.getByRole('button', { name: 'Dismiss notification' });
    fireEvent.click(closeButton);

    expect(within(politeRegion()).queryByText('Escrow #1 funded')).not.toBeInTheDocument();
  });

  it('renders close buttons in DOM order after the message and never steals focus', () => {
    renderToasts();
    const fundButton = screen.getByRole('button', { name: 'fund' });
    fundButton.focus();
    fireEvent.click(fundButton);

    const toast = within(politeRegion()).getByText('Escrow #1 funded').closest('.toast') as HTMLElement;
    const closeButton = within(toast).getByRole('button', { name: 'Dismiss notification' });
    expect(toast.contains(closeButton)).toBe(true);
    expect(fundButton).toHaveFocus();
  });

  it('dismisses the focused toast with Escape', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    const closeButton = screen.getByRole('button', { name: 'Dismiss notification' });

    closeButton.focus();
    fireEvent.keyDown(closeButton.closest('.toast') as HTMLElement, { key: 'Escape' });

    expect(within(politeRegion()).queryByText('Escrow #1 funded')).not.toBeInTheDocument();
  });

  it('clears every toast when dismiss is called without an id', () => {
    renderToasts();
    fireEvent.click(screen.getByRole('button', { name: 'fund' }));
    fireEvent.click(screen.getByRole('button', { name: 'fail' }));
    fireEvent.click(screen.getByRole('button', { name: 'clear' }));

    expect(politeRegion().querySelectorAll('.toast')).toHaveLength(0);
    expect(alertRegion().querySelectorAll('.toast')).toHaveLength(0);
  });

  it('throws a helpful error when useToast is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useToast must be used within a <ToastProvider>');
    spy.mockRestore();
  });
});
