// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const { getAccountEmail, signOut } = vi.hoisted(() => ({
  getAccountEmail: vi.fn(),
  signOut: vi.fn(async () => {}),
}));
vi.mock('@/lib/web/supabase-browser', () => ({ getAccountEmail, signOut }));

import { AccountMenu } from './AccountMenu';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AccountMenu', () => {
  it('shows a sign-in link when signed out', async () => {
    getAccountEmail.mockResolvedValue(null);
    render(<AccountMenu />);
    await waitFor(() => expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy());
  });

  it('shows the email, a dashboard link, and a working sign-out when signed in', async () => {
    getAccountEmail.mockResolvedValue('itaitevet@gmail.com');
    render(<AccountMenu />);
    await waitFor(() => expect(screen.getByText('itaitevet@gmail.com')).toBeTruthy());
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
