// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ArtifactRow } from './ArtifactRow';
import type { ArtifactListItem } from '@/lib/web/dashboard';

const item: ArtifactListItem = {
  slug: 'a3f9', title: 'Q3 Revenue Dashboard', visibility: 'public',
  created_at: '2026-06-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', view_count: 142,
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ArtifactRow', () => {
  it('renders title, slug, visibility, views, and an Open link to the viewer', () => {
    render(<ArtifactRow item={item} onDelete={vi.fn()} />);
    expect(screen.getByText('Q3 Revenue Dashboard')).toBeTruthy();
    expect(screen.getByText(/a3f9/)).toBeTruthy();
    expect(screen.getByText(/public/i)).toBeTruthy();
    expect(screen.getByText(/142/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /open/i }).getAttribute('href')).toBe('/a/a3f9');
    expect(screen.getByRole('link', { name: /edit/i }).getAttribute('href')).toBe('/dashboard/a3f9');
  });

  it('asks for confirmation and calls onDelete only after confirming', () => {
    const onDelete = vi.fn();
    render(<ArtifactRow item={item} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();           // confirm dialog shown first
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith('a3f9');
  });
});
