'use client';

import { forwardRef, useCallback, useId, useImperativeHandle, useRef, useState } from 'react';
import { normalizeAddress, validateAddress, type AddressKind } from '@/lib/stellar/address';

export interface AddressInputHandle {
  validate: () => boolean;
  focus: () => void;
}

interface AddressInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  allow?: AddressKind[];
  placeholder?: string;
  description?: string;
  walletAddress?: string | null;
  error?: string | null;
}

export const AddressInput = forwardRef<AddressInputHandle, AddressInputProps>(function AddressInput(
  { label, value, onChange, id, allow, placeholder, description, walletAddress, error: externalError },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const inputId = id ?? `address-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = `${inputId}-error`;
  const [validationError, setValidationError] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const shownError = validationError ?? externalError ?? null;

  const validate = useCallback((): boolean => {
    const result = validateAddress(value, { allow });
    if (result.ok) {
      setValidationError(null);
      if (result.value !== value) onChange(result.value);
      return true;
    }
    setValidationError(result.message);
    return false;
  }, [allow, onChange, value]);

  useImperativeHandle(
    ref,
    () => ({
      validate,
      focus: () => inputRef.current?.focus(),
    }),
    [validate],
  );

  const change = (raw: string) => {
    setClipboardError(null);
    if (validationError) setValidationError(null);
    onChange(normalizeAddress(raw));
  };

  const paste = async () => {
    setClipboardError(null);
    try {
      const text = await navigator.clipboard.readText();
      const next = normalizeAddress(text);
      onChange(next);
      const result = validateAddress(next, { allow });
      if (result.ok) {
        setValidationError(null);
      } else {
        setValidationError(result.message);
        inputRef.current?.focus();
      }
    } catch {
      setClipboardError('Could not read the clipboard. Paste the address manually.');
    }
  };

  const useWallet = () => {
    if (!walletAddress) return;
    const next = normalizeAddress(walletAddress);
    onChange(next);
    const result = validateAddress(next, { allow });
    setValidationError(result.ok ? null : result.message);
    inputRef.current?.focus();
  };

  const describedBy =
    [descriptionId, shownError ? errorId : undefined, clipboardError ? `${inputId}-clipboard` : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="address-row">
        <input
          ref={inputRef}
          id={inputId}
          className="input mono"
          value={value}
          placeholder={placeholder}
          onChange={(event) => change(event.target.value)}
          onBlur={validate}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setValidationError(null);
          }}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button className="btn btn-secondary btn-sm" type="button" onClick={paste}>
          Paste
        </button>
        {walletAddress && (
          <button className="btn btn-secondary btn-sm" type="button" onClick={useWallet}>
            Use my wallet
          </button>
        )}
      </div>
      {description && (
        <span id={descriptionId} className="small muted">
          {description}
        </span>
      )}
      {shownError && (
        <span id={errorId} className="field-error" role="alert">
          {shownError}
        </span>
      )}
      {clipboardError && (
        <span id={`${inputId}-clipboard`} className="field-error" role="alert">
          {clipboardError}
        </span>
      )}
    </div>
  );
});
