// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Header → AccountMenu calls getAccountEmail() on mount; keep it deterministic + offline.
vi.mock('@/lib/web/auth', () => ({
  getAccountEmail: vi.fn(async () => null),
  signOut: vi.fn(async () => {}),
}));

import { Header } from './Header';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Header', () => {
  it('renders a GitHub repository link that opens in a new tab', () => {
    render(<Header />);
    const link = screen.getByRole('link', { name: /github repository/i });
    expect(link.getAttribute('href')).toBe('https://github.com/ItaiTevet/artifact.host');
    expect(link.getAttribute('target')).toBe('_blank');
    expect((link.getAttribute('rel') ?? '')).toContain('noopener');
  });
});
