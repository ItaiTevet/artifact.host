// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ShareRoleEditor } from './ShareRoleEditor';
import type { SharePrincipal } from '@/lib/artifacts/types';

afterEach(() => cleanup());

function setup(initial: SharePrincipal[] = []) {
  const onChange = vi.fn();
  const utils = render(<ShareRoleEditor principals={initial} onChange={onChange} />);
  return { onChange, ...utils };
}

describe('ShareRoleEditor', () => {
  it('adds an email principal (default role view) from the input on Add', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).toHaveBeenCalledWith([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
  });

  it('detects an @domain entry', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: '@acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).toHaveBeenCalledWith([{ value: 'acme.com', type: 'domain', role: 'view' }]);
  });

  it('does not add a duplicate', () => {
    const { onChange } = setup([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles a principal role to comment', () => {
    const { onChange } = setup([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
    fireEvent.click(screen.getByRole('button', { name: /comment/i }));
    expect(onChange).toHaveBeenCalledWith([{ value: 'alice@example.com', type: 'email', role: 'comment' }]);
  });

  it('removes a principal', () => {
    const { onChange } = setup([{ value: 'alice@example.com', type: 'email', role: 'view' }]);
    fireEvent.click(screen.getByRole('button', { name: /remove alice@example.com/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
