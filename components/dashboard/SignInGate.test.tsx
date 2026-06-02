// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('@/lib/web/supabase-browser', () => ({ signIn }));

import { SignInGate } from './SignInGate';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SignInGate', () => {
  it('renders both providers and calls signIn on click', () => {
    render(<SignInGate />);
    fireEvent.click(screen.getByRole('button', { name: /Google/i }));
    expect(signIn).toHaveBeenCalledWith('google');
    fireEvent.click(screen.getByRole('button', { name: /GitHub/i }));
    expect(signIn).toHaveBeenCalledWith('github');
  });
});
