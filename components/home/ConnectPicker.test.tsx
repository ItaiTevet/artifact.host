// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConnectPicker } from './ConnectPicker';

afterEach(cleanup);

describe('ConnectPicker', () => {
  it('reveals a platform snippet containing the MCP URL when a tab is clicked', () => {
    render(<ConnectPicker mcpUrl="https://artifact.host/mcp" />);
    // Snippet hidden until a platform is chosen.
    expect(screen.queryByText(/artifact-host/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cursor/ }));
    expect(screen.getByText(/https:\/\/artifact\.host\/mcp/)).toBeTruthy();
  });

  it('toggles the snippet off when the active tab is clicked again', () => {
    render(<ConnectPicker mcpUrl="https://artifact.host/mcp" />);
    const tab = screen.getByRole('button', { name: /Cursor/ });
    fireEvent.click(tab);
    expect(screen.queryByText(/https:\/\/artifact\.host\/mcp/)).toBeTruthy();
    fireEvent.click(tab);
    expect(screen.queryByText(/https:\/\/artifact\.host\/mcp/)).toBeNull();
  });
});
