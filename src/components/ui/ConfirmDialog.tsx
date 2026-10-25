'use client';

import { ReactNode, useEffect, useId, useRef, useState } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  requireText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTyped('');
      dialog.showModal();
      if (tone === 'danger') cancelRef.current?.focus();
      else confirmRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, tone]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const confirmDisabled = requireText !== undefined && typed !== requireText;

  return (
    <dialog
      ref={dialogRef}
      className={`confirm confirm-${tone}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
    >
      <div className="confirm-body">
        <h2 id={titleId} className="confirm-title">
          {title}
        </h2>
        {description && (
          <div id={descriptionId} className="confirm-description">
            {description}
          </div>
        )}
        {requireText !== undefined && (
          <div className="field">
            <label htmlFor={inputId}>
              Type <span className="mono">{requireText}</span> to confirm
            </label>
            <input
              id={inputId}
              className="input mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
