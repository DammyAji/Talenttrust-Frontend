'use client';

import { FormEvent, KeyboardEvent, RefObject, useEffect, useRef, useState } from 'react';
import { api, EscrowContract } from '@/lib/api';

type DisputeRole = 'client' | 'freelancer';

type DisputeDialogProps = {
  contract: EscrowContract;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSuccess: () => Promise<void>;
};

type DisputeErrors = {
  raisedBy?: string;
  reason?: string;
  evidence?: string;
};

declare global {
  interface Window {
    freighterApi?: {
      getAddress: () => Promise<{ address?: string }>;
    };
  }
}

function validateEvidence(value: string): string | null {
  const urls = value
    .split('\n')
    .map((url) => url.trim())
    .filter(Boolean);

  if (urls.length > 3) return 'Provide no more than 3 evidence links.';
  if (
    urls.some((value) => {
      try {
        return new URL(value).protocol !== 'https:' || !new URL(value).hostname;
      } catch {
        return true;
      }
    })
  ) {
    return 'Evidence links must be valid https:// URLs.';
  }
  return null;
}

function isEmptyResponse(response: unknown): boolean {
  if (!response || typeof response !== 'object' || Object.keys(response).length === 0) return true;
  if (!('data' in response)) return false;
  const data = (response as { data: unknown }).data;
  return (
    data === null ||
    data === undefined ||
    (typeof data === 'string' && data.trim() === '') ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0)
  );
}

export function DisputeDialog({ contract, triggerRef, onClose, onSuccess }: DisputeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [raisedBy, setRaisedBy] = useState<DisputeRole>('client');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [errors, setErrors] = useState<DisputeErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    reasonRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      triggerRef.current?.focus();
    };
  }, [triggerRef]);

  useEffect(() => {
    if (!window.freighterApi) return;
    let active = true;

    window.freighterApi
      .getAddress()
      .then(({ address }) => {
        if (!active || !address) return;
        if (address === contract.client) setRaisedBy('client');
        if (address === contract.freelancer) setRaisedBy('freelancer');
      })
      .catch((error: unknown) => {
        console.error('Could not read the connected wallet address.', error);
      });

    return () => {
      active = false;
    };
  }, [contract.client, contract.freelancer]);

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!posting) close();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: DisputeErrors = {};
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 20) nextErrors.reason = 'Enter a reason with at least 20 characters.';
    else if (reason.length > 1000) nextErrors.reason = 'Reason must be no more than 1000 characters.';

    const evidenceError = validateEvidence(evidence);
    if (evidenceError) nextErrors.evidence = evidenceError;
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const urls = evidence
      .split('\n')
      .map((url) => url.trim())
      .filter(Boolean);
    const postedReason = urls.length ? `${trimmedReason}\n\nEvidence:\n${urls.join('\n')}` : trimmedReason;

    setPosting(true);
    try {
      const result: unknown = await api(`/api/v1/contracts/${contract.id}/dispute`, {
        method: 'POST',
        body: {
          raisedBy: raisedBy === 'client' ? contract.client : contract.freelancer,
          reason: postedReason,
        },
      });
      if (isEmptyResponse(result)) {
        throw new Error('The API returned an empty response. Please try again.');
      }
      close();
      await onSuccess();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not open the dispute. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dispute-dialog"
      aria-labelledby="dispute-dialog-title"
      aria-describedby="dispute-dialog-consequence"
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        if (!posting) close();
      }}
    >
      <form className="dispute-form" onSubmit={submit} noValidate>
        <div className="dispute-heading">
          <div>
            <h2 id="dispute-dialog-title">Open a dispute</h2>
            <p className="muted">Escrow #{contract.id}: {contract.title}</p>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={close} disabled={posting} aria-label="Close dispute dialog">
            Close
          </button>
        </div>

        <fieldset className="dispute-fieldset">
          <legend>Raised by</legend>
          <label className="dispute-option">
            <input
              type="radio"
              name="raised-by"
              value="client"
              checked={raisedBy === 'client'}
              disabled={posting}
              onChange={() => setRaisedBy('client')}
            />
            Client
          </label>
          <label className="dispute-option">
            <input
              type="radio"
              name="raised-by"
              value="freelancer"
              checked={raisedBy === 'freelancer'}
              disabled={posting}
              onChange={() => setRaisedBy('freelancer')}
            />
            Freelancer
          </label>
        </fieldset>

        <div className="field">
          <label htmlFor="dispute-reason">Reason</label>
          <textarea
            ref={reasonRef}
            id="dispute-reason"
            className="input dispute-textarea"
            value={reason}
            disabled={posting}
            onChange={(event) => setReason(event.target.value)}
            required
            aria-invalid={Boolean(errors.reason)}
            aria-describedby="dispute-reason-count dispute-reason-error"
          />
          <div className="dispute-field-meta">
            <span id="dispute-reason-count" className="small muted">{reason.length}/1000 characters (minimum 20)</span>
            <span id="dispute-reason-error" className="dispute-validation" aria-live="polite">{errors.reason}</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="dispute-evidence">Evidence links <span className="muted">(optional, up to 3)</span></label>
          <textarea
            id="dispute-evidence"
            className="input dispute-textarea dispute-evidence"
            value={evidence}
            disabled={posting}
            onChange={(event) => setEvidence(event.target.value)}
            aria-invalid={Boolean(errors.evidence)}
            aria-describedby="dispute-evidence-help dispute-evidence-error"
            placeholder="https://example.com/evidence (one link per line)"
          />
          <span id="dispute-evidence-help" className="small muted">Enter one https:// URL per line.</span>
          <span id="dispute-evidence-error" className="dispute-validation" aria-live="polite">{errors.evidence}</span>
        </div>

        <p id="dispute-dialog-consequence" className="dispute-consequence">
          Releases and cancellation are frozen until an arbiter resolves this dispute.
        </p>

        {submitError && <div className="alert alert-error" role="alert">{submitError}</div>}

        <div className="row dispute-actions">
          <button className="btn btn-primary" type="submit" disabled={posting}>
            {posting ? 'Opening dispute...' : 'Open dispute'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={close} disabled={posting}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
