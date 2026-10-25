'use client';

import { useState } from 'react';
import { useOptionalToast } from '@/components/toast/ToastProvider';

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useOptionalToast();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      style={{ marginTop: 6 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy to the clipboard');
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
