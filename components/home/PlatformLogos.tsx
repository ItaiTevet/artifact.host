import type { ReactNode } from 'react';

// Simple monochrome marks (currentColor) for a quiet "works with" strip. Evocative rather
// than pixel-exact brand reproductions; labels carry recognition.
export const PLATFORMS: { name: string; icon: ReactNode }[] = [
  {
    name: 'Claude Code',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <line x1="12" y1="3" x2="12" y2="8.5" /><line x1="12" y1="15.5" x2="12" y2="21" />
        <line x1="3" y1="12" x2="8.5" y2="12" /><line x1="15.5" y1="12" x2="21" y2="12" />
        <line x1="5.6" y1="5.6" x2="9.5" y2="9.5" /><line x1="14.5" y1="14.5" x2="18.4" y2="18.4" />
        <line x1="18.4" y1="5.6" x2="14.5" y2="9.5" /><line x1="9.5" y1="14.5" x2="5.6" y2="18.4" />
      </svg>
    ),
  },
  {
    name: 'Cursor',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.6L20.4 7.3V16.7L12 21.4L3.6 16.7V7.3Z" />
        <path d="M12 12L20.4 7.3M12 12V21.4M12 12L3.6 7.3" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    name: 'Copilot',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 13a8 6.5 0 0 1 16 0v2.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 15.5Z" />
        <path d="M9 6.6c1.6-1.4 4.4-1.4 6 0" />
        <ellipse cx="9.2" cy="14" rx="1.4" ry="2" fill="currentColor" stroke="none" />
        <ellipse cx="14.8" cy="14" rx="1.4" ry="2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: 'VS Code',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 12L20 3.8V20.2Z" />
        <path d="M4 9.2L6.6 7.3L13 12L6.6 16.7L4 14.8L8.6 12Z" />
      </svg>
    ),
  },
  {
    name: 'Windsurf',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M12.5 3.5L5 18h7.5z" fill="currentColor" stroke="none" />
        <path d="M12.5 3.5V20" /><path d="M4.5 20h15" />
      </svg>
    ),
  },
  {
    name: 'ChatGPT',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="3.6" ry="8.5" />
        <ellipse cx="12" cy="12" rx="3.6" ry="8.5" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="3.6" ry="8.5" transform="rotate(120 12 12)" />
      </svg>
    ),
  },
  {
    name: 'Gemini',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C12.4 7 17 11.6 22 12C17 12.4 12.4 17 12 22C11.6 17 7 12.4 2 12C7 11.6 11.6 7 12 2Z" />
      </svg>
    ),
  },
];
