'use client';

import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

export const STAR_LABELS = [
  '1 star – Poor',
  '2 stars – Fair',
  '3 stars – Good',
  '4 stars – Very good',
  '5 stars – Excellent',
] as const;

export interface StarRatingProps {
  onSubmit: (rating: number) => void;
  disabled?: boolean;
  error?: string | null;
}

export function StarRating({ onSubmit, disabled = false, error = null }: StarRatingProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusValue, setFocusValue] = useState(1);
  const radioRefs = useRef<Array<HTMLDivElement | null>>([]);
  const preview = hovered ?? selected;

  const select = (value: number) => {
    setSelected(value);
    setFocusValue(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, focusValue + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, focusValue - 1);
    else if (event.key === 'Home') next = 1;
    else if (event.key === 'End') next = 5;
    else if (event.key === ' ' || event.key === 'Enter') {
      // Activating a radio only selects it — submission is a separate step.
      event.preventDefault();
      select(focusValue);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      select(next);
      radioRefs.current[next - 1]?.focus();
    }
  };

  return (
    <div className="rate">
      <div
        className="stars"
        role="radiogroup"
        aria-label="Rate the freelancer"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
      >
        {STAR_LABELS.map((label, index) => {
          const value = index + 1;
          const checked = selected === value;
          return (
            <div
              key={value}
              ref={(el) => {
                radioRefs.current[index] = el;
              }}
              role="radio"
              aria-checked={checked}
              aria-label={label}
              tabIndex={(selected === null ? value === 1 : checked) ? 0 : -1}
              className={`star${preview !== null && value <= preview ? ' star-on' : ''}`}
              onClick={() => {
                if (!disabled) select(value);
              }}
              onFocus={() => setFocusValue(value)}
              onMouseEnter={(_e: MouseEvent<HTMLDivElement>) => {
                if (!disabled) setHovered(value);
              }}
              onMouseLeave={() => setHovered(null)}
            >
              <span aria-hidden="true">★</span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={disabled || selected === null}
        onClick={() => selected !== null && onSubmit(selected)}
      >
        Submit rating
      </button>
      <p className="small muted rate-note">
        Ratings are permanent and count toward the freelancer&apos;s on-chain reputation.
      </p>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

