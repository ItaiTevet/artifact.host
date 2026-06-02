// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QrCode } from './QrCode';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,FAKE') },
}));

afterEach(cleanup);

describe('QrCode', () => {
  it('renders an img with the generated data URL', async () => {
    render(<QrCode value="https://artifact.host/a/x7k2" />);
    await waitFor(() => {
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img.src).toContain('data:image/png;base64,FAKE');
    });
  });
});
