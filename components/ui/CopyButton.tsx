'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — ignore */ }
  }
  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? 'copied ✓' : label}
    </button>
  );
}
